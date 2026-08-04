import express from "express";
import axios from "axios";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// ---- 환경 변수 ----
const REDMINE_URL = process.env.REDMINE_URL; // 예: https://issue.pointmobile.co.kr
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const MCP_SHARED_SECRET = process.env.MCP_SHARED_SECRET; // 이 서버 접근을 보호하는 자체 비밀키 (선택)
const PORT = process.env.PORT || 3000;

if (!REDMINE_URL || !REDMINE_API_KEY) {
  console.error("REDMINE_URL, REDMINE_API_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const redmine = axios.create({
  baseURL: REDMINE_URL,
  headers: { "X-Redmine-API-Key": REDMINE_API_KEY },
});

// ---- MCP 서버 정의 ----
function buildServer() {
  const server = new McpServer({
    name: "redmine-mcp-server",
    version: "1.0.0",
  });

  server.tool(
    "get_issue",
    "레드마인 이슈 하나를 ID로 조회합니다.",
    {
      issue_id: z.number().describe("조회할 이슈 번호"),
      include_journals: z.boolean().optional().describe("코멘트/이력 포함 여부"),
    },
    async ({ issue_id, include_journals }) => {
      try {
        const { data } = await redmine.get(`/issues/${issue_id}.json`, {
          params: include_journals ? { include: "journals" } : {},
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data.issue, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `조회 실패: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}` }],
        };
      }
    }
  );

  server.tool(
    "list_issues",
    "레드마인 이슈 목록을 조건에 맞게 조회합니다.",
    {
      project_id: z.union([z.string(), z.number()]).optional().describe("프로젝트 ID 또는 식별자"),
      status_id: z.string().optional().describe("open / closed / * / 상태ID"),
      assigned_to_id: z.union([z.string(), z.number()]).optional().describe("담당자 ID (me 가능)"),
      priority_id: z.union([z.string(), z.number()]).optional().describe("우선순위 ID로 필터 (레드마인 설정에 따라 다르며, 보통 Low=3,Normal=4,High=5,Urgent=6,Immediate=7 근처)"),
      min_priority_name: z.enum(["Normal", "High", "Urgent", "Immediate"]).optional().describe("이 우선순위 '이상'만 필터링 (결과를 받아온 뒤 서버에서 걸러줌, 레드마인 우선순위 이름 기준)"),
      limit: z.number().max(100).optional().describe("가져올 개수 (기본 25, priority 필터 적용 전 원본 조회 개수)"),
    },
    async ({ project_id, status_id, assigned_to_id, priority_id, min_priority_name, limit }) => {
      try {
        const { data } = await redmine.get("/issues.json", {
          params: {
            project_id,
            status_id,
            assigned_to_id,
            priority_id,
            limit: limit ?? 25,
          },
        });

        let issues = data.issues;

        if (min_priority_name) {
          // 레드마인 기본 우선순위 순서 (낮음→높음). 커스터마이즈된 경우 이름 매칭이 안 될 수 있음.
          const order = ["Low", "Normal", "High", "Urgent", "Immediate"];
          const minIndex = order.indexOf(min_priority_name);
          issues = issues.filter((i) => order.indexOf(i.priority.name) >= minIndex);
        }

        const summary = issues.map(
          (i) => `#${i.id} [${i.status.name}] [${i.priority.name}] ${i.subject}`
        );
        return { content: [{ type: "text", text: summary.join("\n") || "결과 없음" }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `조회 실패: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}` }],
        };
      }
    }
  );

  server.tool(
    "create_issue",
    "레드마인에 새 이슈를 생성합니다.",
    {
      project_id: z.union([z.string(), z.number()]).describe("프로젝트 ID 또는 식별자"),
      subject: z.string().describe("이슈 제목"),
      description: z.string().optional().describe("이슈 본문"),
      tracker_id: z.number().optional().describe("트래커 ID (버그/기능 등)"),
      priority_id: z.number().optional().describe("우선순위 ID"),
    },
    async ({ project_id, subject, description, tracker_id, priority_id }) => {
      try {
        const { data } = await redmine.post("/issues.json", {
          issue: { project_id, subject, description, tracker_id, priority_id },
        });
        return { content: [{ type: "text", text: `생성됨: #${data.issue.id}` }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `생성 실패: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}` }],
        };
      }
    }
  );

  server.tool(
    "update_issue",
    "기존 레드마인 이슈를 수정합니다.",
    {
      issue_id: z.number().describe("수정할 이슈 번호"),
      status_id: z.number().optional().describe("변경할 상태 ID"),
      notes: z.string().optional().describe("추가할 코멘트"),
      subject: z.string().optional().describe("변경할 제목"),
      assigned_to_id: z.number().optional().describe("변경할 담당자 ID"),
    },
    async ({ issue_id, status_id, notes, subject, assigned_to_id }) => {
      try {
        await redmine.put(`/issues/${issue_id}.json`, {
          issue: { status_id, notes, subject, assigned_to_id },
        });
        return { content: [{ type: "text", text: `#${issue_id} 수정 완료` }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `수정 실패: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}` }],
        };
      }
    }
  );

  return server;
}

// ---- HTTP 서버 (원격 MCP 커넥터용) ----
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  if (MCP_SHARED_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${MCP_SHARED_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Redmine MCP 서버 실행 중: http://localhost:${PORT}/mcp`);
});
