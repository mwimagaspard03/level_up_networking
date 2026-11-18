type SectionTitleProps = {
  eyebrow: string;
  title: string;
  description: string;
  titleId?: string;
};

export default function SectionTitle({
  eyebrow,
  title,
  description,
  titleId,
}: SectionTitleProps) {
  return (
    <div className="section-title">
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
