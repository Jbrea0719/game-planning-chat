import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { content } = await request.json();
    if (!content) return Response.json({ suggestions: [] });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `다음 게임 기획서를 읽고, 시각 자료가 있으면 이해를 크게 도울 섹션을 3~4개 골라줘.
각 섹션에 대해 두 가지 유형 중 하나로 처리해:

- diagram: 게임 루프·시스템 흐름·구조·확률 관계처럼 "흐름이나 구조"를 보여줄 때
- mockup: UI 화면·게임 플레이·유저 경험처럼 "실제 화면"이 필요할 때

아래 JSON 배열 형식으로만 응답해. 다른 텍스트는 절대 쓰지 마.

diagram 예시:
{
  "heading": "## 2. 핵심 메커니즘",
  "type": "diagram",
  "alt": "게임 루프 플로우차트",
  "mermaid": "graph TD\\n  A[유저 접속] --> B[일일퀘스트]\\n  B --> C[보상수령]\\n  C --> D[가챠도전]\\n  D --> E{영웅 획득?}\\n  E -- 예 --> F[영웅 강화]\\n  E -- 아니오 --> B"
}

mockup 예시:
{
  "heading": "## 4. 밸런스 및 유저 경험",
  "type": "mockup",
  "alt": "영웅 선택 화면 UI",
  "prompt": "mobile RPG hero collection screen UI, dark fantasy theme, character portrait cards in a 3x3 grid, glowing rarity borders gold silver bronze, gacha pull button at bottom, Korean mobile game screenshot style, professional game design, dark blue background"
}

Mermaid 작성 규칙:
- graph TD 또는 sequenceDiagram 만 사용
- 노드 텍스트에 따옴표·꺾쇠괄호 사용 금지, 한글 가능
- \\n 으로 줄바꿈 (실제 줄바꿈 금지)

mockup 프롬프트 규칙:
- 구체적인 UI 요소를 영어로 상세히 묘사
- "mobile game screenshot", "dark fantasy", "professional game design" 포함
- 기획서 내용과 직접 관련된 화면 묘사

기획서:
${content.slice(0, 4000)}`,
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return Response.json({ suggestions: [] });

    const suggestions = JSON.parse(jsonMatch[0]);
    return Response.json({ suggestions });
  } catch (error) {
    console.error("[api/image-suggest] 오류:", error);
    return Response.json({ suggestions: [] });
  }
}
