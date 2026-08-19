export default function Badge({ cls, children }) {
  return <span className={`badge ${cls}`}>{children}</span>;
}
