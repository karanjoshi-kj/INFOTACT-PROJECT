import './Toolbar.css'

function Toolbar({ onFormat }) {
  return (
    <div className="toolbar">
      <button
        className="toolbar-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onFormat('bold')}
      >
        <b>B</b>
      </button>
      <button
        className="toolbar-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onFormat('italic')}
      >
        <i>I</i>
      </button>
      <button
        className="toolbar-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onFormat('underline')}
      >
        <u>U</u>
      </button>
    </div>
  )
}

export default Toolbar