export function HelpPanel() {
  return (
    <div className="help-panel">
      <h2>Help</h2>
      <p>Need a hand?</p>
      <div className="help-box">
        <label className="settings-field">
          <a
            className="link"
            href="https://docs.google.com/document/d/1D0YqHct_d3rR8WtlkHF9Dybqb3mFB7Wka0ZWsFZOda8/edit?tab=t.0"
            role="button"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tutorials
            <span className="material-symbols-rounded">arrow_outward</span>
          </a>
        </label>
      </div>
      <p>
        Extension not working properly? Found a bug?
        <br />
        Feel free to send me an email: gwantanak.3@gmail.com
      </p>
    </div>
  );
}
