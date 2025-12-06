// app/api/chat/session/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// 临时版：不访问数据库，只返回空消息列表
export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      ok: true,
      messages: [],
      note: "临时版本：服务器不读取数据库，只返回空消息列表。",
    },
    { status: 200 }
  );
}

// 临时版：不做真正删除操作，只假装成功
export async function DELETE(req: NextRequest) {
  return NextResponse.json(
    {
      ok: true,
      note: "临时版本：未真正删除数据库记录，只返回成功。",
    },
    { status: 200 }
  );
}
