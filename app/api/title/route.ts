import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: Request) {
  const { content } = (await request.json()) as { content: string };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 60,
    messages: [{
      role: "user",
      content: `아래 내용을 한 줄로 요약한 파일 제목을 지어줘. 조건: 한국어 10자 이내, 특수문자/따옴표/마침표 없이 명사형으로만. 제목만 출력해.\n\n${content.slice(0, 500)}`,
    }],
  });

  const title = response.content[0].type === "text"
    ? response.content[0].text.trim().replace(/[/\\:*?"<>|.\n]/g, "").slice(0, 30)
    : "조던답변";

  return Response.json({ title });
}
