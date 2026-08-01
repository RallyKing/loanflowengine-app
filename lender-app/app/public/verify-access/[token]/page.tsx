import { VerifyAccessClient } from "./VerifyAccessClient";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function VerifyAccessPage({ params }: PageProps) {
  const { token } = await params;
  return <VerifyAccessClient token={decodeURIComponent(token)} />;
}
