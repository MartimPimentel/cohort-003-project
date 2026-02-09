import { redirect } from "react-router";
import type { Route } from "./+types/api.set-dev-country";
import { setDevCountry } from "~/lib/session";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const country = formData.get("country");

  const cookie = await setDevCountry(
    request,
    typeof country === "string" && country.length === 2 ? country : null
  );

  return redirect(new URL(request.url).searchParams.get("redirectTo") ?? "/", {
    headers: { "Set-Cookie": cookie },
  });
}
