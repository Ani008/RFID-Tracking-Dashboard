import './StatusBadge.css';

const LOCATION_STYLES = {
  SHELF_ROOM: { label: 'Shelf Room', tone: 'green' },
  COURT_ROOM: { label: 'Court Room', tone: 'blue' },
  IN_TRANSIT: { label: 'In Transit', tone: 'orange' },
};

const DIRECTION_STYLES = {
  IN: { label: 'IN', tone: 'green' },
  OUT: { label: 'OUT', tone: 'red' },
};

export function LocationBadge({ location }) {
  const style = LOCATION_STYLES[location] || { label: location, tone: 'neutral' };
  return <span className={`status-badge tone-${style.tone}`}>{style.label}</span>;
}

export function DirectionBadge({ direction }) {
  const style = DIRECTION_STYLES[direction] || { label: direction, tone: 'neutral' };
  return <span className={`status-badge tone-${style.tone}`}>{style.label}</span>;
}
