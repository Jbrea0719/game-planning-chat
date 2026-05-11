import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const PROFILE_SYSTEM_PROMPT = `당신은 대화 분석 전문가입니다.
주어진 대화를 분석해서 사용자에 대한 핵심 정보를 간결하게 정리하세요.

정리할 내용:
- 배경 및 전문성 (경력, 역할, 경험)
- 게임 기획 철학 및 선호 방향
- 관심 있는 시스템·콘텐츠 영역
- 목표 및 추진 중인 프로젝트
- 소통 스타일 및 특이사항

규칙:
- 대화에서 명확히 드러난 사실만 기재
- 추측이나 가정은 제외
- 불릿 포인트로 간결하게
- 기존 프로필이 있으면 새 정보와 통합 (중복 제거, 업데이트)
- 한국어로 작성`;

type Message = { role: "user" | "assistant"; content: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) return Response.json({ profile: "" });

  const { data } = await supabase
    .from("user_profiles")
    .select("profile")
    .eq("session_id", sessionId)
    .single();

  return Response.json({ profile: data?.profile ?? "" });
}

export async function POST(request: Request) {
  const { session_id, messages, existing_profile } = (await request.json()) as {
    session_id: string;
    messages: Message[];
    existing_profile: string;
  };

  const conversationText = messages
    .map((m) => `[${m.role === "user" ? "사용자" : "조던"}] ${m.content}`)
    .join("\n\n");

  const prompt = existing_profile
    ? `기존 프로필:\n${existing_profile}\n\n새 대화:\n${conversationText}`
    : `대화:\n${conversationText}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: PROFILE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `이 대화를 분석해서 사용자 프로필을 정리해줘.\n\n${prompt}` }],
  });

  const profile = response.content[0].type === "text" ? response.content[0].text : "";

  await supabase.from("user_profiles").upsert(
    { session_id, profile, updated_at: new Date().toISOString() },
    { onConflict: "session_id" }
  );

  return Response.json({ profile });
}
