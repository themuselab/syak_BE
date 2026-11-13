import { Pool } from "pg";
import { parse, toSql } from "pgsql-ast-parser";

export const EXPLORER_SCHEMA = [
  {
    name: "shops",
    label: "매장",
    columns: [
      "id",
      "name",
      "gu",
      "category",
      "is_partner",
      "review_count",
      "min_price",
      "today_open",
      "partner_synced_at",
    ],
  },
  {
    name: "analytics_events",
    label: "사용자 행동",
    columns: [
      "event_name",
      "session_id",
      "shop_id",
      "shop_type",
      "platform",
      "occurred_at",
      "reservation_method",
    ],
  },
  {
    name: "shop_view_events",
    label: "서버 상세 조회",
    columns: ["shop_id", "viewed_at"],
  },
  {
    name: "reservation_click_events",
    label: "서버 예약 버튼 클릭",
    columns: ["shop_id", "clicked_at"],
  },
  {
    name: "users",
    label: "회원 가입·상태",
    columns: ["id", "status", "created_at"],
  },
  {
    name: "favorites",
    label: "현재 즐겨찾기",
    columns: ["shop_id", "created_at"],
  },
  {
    name: "slot_alerts",
    label: "빈자리 알림 신청",
    columns: ["shop_id", "created_at", "notified_at"],
  },
  {
    name: "notifications",
    label: "알림 발송·열람",
    columns: ["id", "type", "created_at", "pushed_at", "opened_at", "read_at"],
  },
];

/** A deliberately small SQL dialect. Re-serialize validated AST; never execute input text. */
export function validateExplorerSql(sql: string): string {
  if (!sql || sql.length > 6000)
    throw new Error("SQL은 6,000자 이내로 입력해 주세요.");
  let statements;
  try {
    statements = parse(sql);
  } catch {
    throw new Error("SQL 문법을 확인해 주세요. 예제에서 시작하면 쉬워요.");
  }
  if (statements.length !== 1 || statements[0].type !== "select")
    throw new Error("SELECT 조회 한 문장만 실행할 수 있어요.");
  const ast = statements[0];
  if (ast.distinct && ast.distinct !== "distinct")
    throw new Error("DISTINCT ON은 지원하지 않아요.");
  const allowed = [
    "type",
    "columns",
    "from",
    "where",
    "groupBy",
    "orderBy",
    "limit",
    "distinct",
  ];
  if (Object.keys(ast).some((k) => !allowed.includes(k)))
    throw new Error("지원하지 않는 SQL 구문입니다.");
  if (ast.from?.length !== 1 || ast.from[0].type !== "table")
    throw new Error("목록에 있는 테이블 한 개를 선택해 주세요.");
  const from = ast.from[0];
  if (
    Object.keys(from).some((k) => !["type", "name"].includes(k)) ||
    from.name.schema ||
    from.name.alias
  )
    throw new Error("조인·별칭·스키마 지정은 지원하지 않아요.");
  const table = EXPLORER_SCHEMA.find((t) => t.name === from.name.name);
  if (!table) throw new Error("조회할 수 없는 테이블입니다.");
  const aliases = (ast.columns ?? []).flatMap((c) =>
    c.alias ? [c.alias.name] : [],
  );
  // Reject every expression variant except these pure built-in aggregates and comparisons.
  const expression = (
    value: unknown,
    order = false,
    countStar = false,
  ): void => {
    if (!value || typeof value !== "object")
      throw new Error("지원하지 않는 표현식입니다.");
    const v = value as Record<string, any>;
    const keys = (names: string[]) => {
      if (Object.keys(v).some((k) => !["type", ...names].includes(k)))
        throw new Error("지원하지 않는 표현식 옵션입니다.");
    };
    switch (v.type) {
      case "ref":
        keys(["name"]);
        if (
          !(
            table.columns.includes(v.name) ||
            (order && aliases.includes(v.name)) ||
            (countStar && v.name === "*")
          )
        )
          throw new Error(
            "조회 가능한 컬럼을 선택해 주세요. SELECT * 대신 컬럼 이름을 써 주세요.",
          );
        break;
      case "integer":
      case "numeric":
      case "string":
      case "boolean":
        keys(["value"]);
        break;
      case "null":
        keys([]);
        break;
      case "binary":
        keys(["left", "right", "op"]);
        if (
          ![
            "=",
            "!=",
            "<>",
            ">",
            "<",
            ">=",
            "<=",
            "AND",
            "OR",
            "LIKE",
            "ILIKE",
          ].includes(v.op)
        )
          throw new Error("지원하지 않는 비교 연산입니다.");
        expression(v.left);
        expression(v.right);
        break;
      case "unary":
        keys(["operand", "op"]);
        if (!["IS NULL", "IS NOT NULL", "NOT"].includes(v.op))
          throw new Error("지원하지 않는 연산입니다.");
        expression(v.operand);
        break;
      case "call":
        keys(["function", "args", "distinct"]);
        if (
          Object.keys(v.function).some((k) => k !== "name") ||
          !["count", "sum", "avg", "min", "max"].includes(v.function.name) ||
          v.args.length !== 1
        )
          throw new Error("COUNT, SUM, AVG, MIN, MAX만 사용할 수 있어요.");
        expression(v.args[0], false, v.function.name === "count");
        break;
      default:
        throw new Error("지원하지 않는 SQL 표현식입니다.");
    }
  };
  for (const c of ast.columns ?? []) {
    if (Object.keys(c).some((k) => !["expr", "alias"].includes(k)))
      throw new Error("지원하지 않는 컬럼 옵션입니다.");
    expression(c.expr);
  }
  if (!ast.columns?.length) throw new Error("컬럼을 선택해 주세요.");
  if (ast.where) expression(ast.where);
  ast.groupBy?.forEach((e) => expression(e));
  ast.orderBy?.forEach((o) => {
    if (Object.keys(o).some((k) => !["by", "order", "nulls"].includes(k)))
      throw new Error("지원하지 않는 정렬입니다.");
    expression(o.by, true);
  });
  if (ast.limit) {
    if (
      ast.limit.offset ||
      !ast.limit.limit ||
      ast.limit.limit.type !== "integer" ||
      ast.limit.limit.value < 1 ||
      ast.limit.limit.value > 500
    )
      throw new Error("LIMIT은 1~500 사이로 입력해 주세요.");
  }
  // Lock name resolution to pg_catalog/public at execution, never a user-controlled schema.
  return toSql.statement(ast);
}

export async function runExplorer(pool: Pool, sql: string) {
  const normalized = validateExplorerSql(sql);
  const client = await pool.connect();
  const started = Date.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL search_path = pg_catalog, public");
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    const result = await client.query(
      `SELECT * FROM (${normalized.replace(/;\s*$/, "")}) AS result LIMIT 501`,
    );
    await client.query("COMMIT");
    return {
      columns: result.fields.map((f) => f.name),
      rows: result.rows.slice(0, 500),
      truncated: result.rows.length > 500,
      durationMs: Date.now() - started,
      sql: normalized,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
