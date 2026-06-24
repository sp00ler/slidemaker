import { LoginForm } from "./LoginForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return <LoginForm expired={searchParams?.error === "expired"} />;
}
