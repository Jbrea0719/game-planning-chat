import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 단일 항목 재생성: 특정 섹션에 대한 다이어그램 또는 UI 목업 프롬프트를 새로 생성
export async function POST(request: Request) {
  try {
    const { type, heading, content } = (await request.json()) as {
      type: "diagram" | "mockup";
      heading: string;
      content: string;
    };
    if (!type || !heading) return Response.json({ error: "type, heading 필요" }, { status: 400 });

    const instruction =
      type === "diagram"
        ? `"${heading}" 섹션에 들어갈 게임 기획 다이어그램을 새로 만들어줘. 이전과 다른 구조/표현으로.
아래 JSON 형식으로만 응답 (다른 텍스트 금지):
{"alt":"다이어그램 설명(한국어 15자 이내)","mermaid":"graph TD\\n  A[노드] --> B[노드]"}

Mermaid 규칙: graph TD 또는 sequenceDiagram만, 노드 텍스트에 따옴표·꺾쇠 금지, \\n으로 줄바꿈(실제 줄바꿈 금지), 한글 가능.`
        : `"${heading}" 섹션에 들어갈 게임 UI 화면 이미지 프롬프트를 새로 만들어줘. 이전과 다른 화면 구성/앵글로.
아래 JSON 형식으로만 응답 (다른 텍스트 금지):
{"alt":"화면 설명(한국어 15자 이내)","prompt":"detailed English prompt: mobile game screenshot, dark fantasy, professional game design, ..."}`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `${instruction}\n\n참고용 기획서 일부:\n${content.slice(0, 2500)}`,
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: "파싱 실패" }, { status: 500 });

    const result = JSON.parse(jsonMatch[0]);
    return Response.json(result);
  } catch (error) {
    console.error("[api/image-regenerate] 오류:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
