export default function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase()}`}>
      <i />
      {value}
    </span>
  );
}
