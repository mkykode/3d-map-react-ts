import { getAllEventColors } from '../lib/getColorForEvent';

const Legend = () => {
  const colors = getAllEventColors();

  return (
    <div style={{
      position: 'absolute',
      top: 50,
      right: 20,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '15px',
      borderRadius: '5px',
      color: 'white',
      zIndex: 1,
      maxHeight: '80vh',
      overflowY: 'auto'
    }}>
      <h3 style={{ margin: '0 0 10px 0' }}>Event Categories</h3>
      {Array.from(colors).map(([category, color]) => (
        <div 
          key={category} 
          style={{ 
            display: 'flex', 
            alignItems: 'center',
            marginBottom: '8px'
          }}
        >
          <div style={{
            width: '20px',
            height: '20px',
            backgroundColor: `#${color.getHexString()}`,
            marginRight: '10px',
            borderRadius: '3px'
          }} />
          <span style={{ 
            textTransform: 'capitalize',
            fontSize: '14px'
          }}>
            {category.replace(/([A-Z])/g, ' $1').trim()}
          </span>
        </div>
      ))}
    </div>
  );
};

export default Legend;