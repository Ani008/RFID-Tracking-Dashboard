import PageHeader from '../components/PageHeader.jsx';

export default function ComingSoon({ title, subtitle }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div
        style={{
          background: 'var(--surface)',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 14,
        }}
      >
        This screen is built in the next step. The API endpoints behind it are already live.
      </div>
    </div>
  );
}
