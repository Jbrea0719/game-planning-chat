import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { content } = await request.json();
    if (!content) return Response.json({ suggestions: [] });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `다음 게임 기획서를 읽고, 이미지(일러스트·다이어그램·UI 목업 등)가 있으면 이해를 크게 도울 섹션을 2~4개 골라줘.

각 섹션에 대해 아래 JSON 배열 형식으로만 응답해. 다른 텍스트는 절대 쓰지 마.
[
  {
    "heading": "문서 안에 실제로 있는 ## 섹션 헤딩 (정확히 일치해야 함)",
    "alt": "이미지 설명 (한국어 15자 이내)",
    "prompt": "detailed English prompt for AI image generation: describe the scene/diagram visually, game design style, dark blue professional theme, high quality"
  }
]

기획서:
${content.slice(0, 4000)}`,
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return Response.json({ suggestions: [] });

    const suggestions = JSON.parse(jsonMatch[0]);
    return Response.json({ suggestions });
  } catch (error) {
    console.error("[api/image-suggest] 오류:", error);
    return Response.json({ suggestions: [] });
  }
}
