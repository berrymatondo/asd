import { NextResponse, type NextRequest } from "next/server";

// Vérification rapide (présence du cookie). La validité réelle de la session
// et les rôles sont contrôlés côté serveur dans les pages et les actions.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/connexion" || request.cookies.has("asd_session")) return NextResponse.next();
  const url = new URL("/connexion", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Exclut l’API, les fichiers de Next et les images publiques (logo…), accessibles sans connexion
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
