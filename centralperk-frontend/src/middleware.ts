import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const cleanedPathname = url.pathname.replace(/(?:%0A|%0D|\n|\r)+/gi, "");

  if (cleanedPathname !== url.pathname) {
    url.pathname = cleanedPathname || "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
