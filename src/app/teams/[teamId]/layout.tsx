export function generateStaticParams() {
  return [
    { teamId: '1' }, { teamId: '2' }, { teamId: '3' }, { teamId: '4' },
    { teamId: '5' }, { teamId: '6' }, { teamId: '7' }, { teamId: '8' },
  ];
}

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
