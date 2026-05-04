import { NextResponse, type NextRequest } from "next/server";

export default function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const cleanedPathname = url.pathname.replace(/(?:%0A|%0D|\n|\r)+/gi, "");

  if (cleanedPathname !== url.pathname) {
    url.pathname = cleanedPathname || "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
