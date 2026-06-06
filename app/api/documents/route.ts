import { supabase } from "@/lib/supabase";

// 기획서 목록 조회 (session_id) 또는 단일 조회 (id)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const sessionId = searchParams.get("session_id");

  // 단일 기획서 전체 내용
  if (id) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, content, enriched_content, created_at")
      .eq("id", id)
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ document: data });
  }

  // 목록 (내용 제외, 가벼운 메타만)
  if (!sessionId) {
    return Response.json({ error: "session_id 또는 id 필요" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, created_at, enriched_content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 목록에는 이미지 포함 여부만 boolean으로 전달 (내용 본문은 미전송)
  const list = (data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    created_at: d.created_at,
    has_images: !!d.enriched_content,
  }));
  return Response.json({ documents: list });
}

// 기획서 신규 저장
export async function POST(request: Request) {
  const { session_id, title, content, enriched_content } = (await request.json()) as {
    session_id: string;
    title?: string;
    content: string;
    enriched_content?: string | null;
  };
  if (!session_id || !content) {
    return Response.json({ error: "session_id, content 필요" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("documents")
    .insert([{ session_id, title: title || "제목 없음", content, enriched_content: enriched_content ?? null }])
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id });
}

// 기획서 이미지 버전 갱신 (id 기준)
export async function PATCH(request: Request) {
  const { id, enriched_content } = (await request.json()) as {
    id: string;
    enriched_content: string;
  };
  if (!id) return Response.json({ error: "id 필요" }, { status: 400 });
  const { error } = await supabase
    .from("documents")
    .update({ enriched_content, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

// 기획서 삭제 (id 기준)
export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id: string };
  if (!id) return Response.json({ error: "id 필요" }, { status: 400 });
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
