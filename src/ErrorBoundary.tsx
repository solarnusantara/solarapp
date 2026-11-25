import React from "react";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("SolarApp ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleReload = () => {
    try {
      // Clear possible corrupted local storage keys for project list
      localStorage.removeItem("sonus_solar_studio_projects_v2");
    } catch {}
    if (this.props.onReset) {
      this.props.onReset();
    }
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/design";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0c100f",
            color: "#e8eef9",
            padding: 24,
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
          }}
        >
          <div
            style={{
              background: "#141c16",
              border: "1px solid #233528",
              borderRadius: 12,
              padding: "36px 32px",
              maxWidth: 540,
              width: "100%",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 12 }}>⚡</div>
            <h2 style={{ fontSize: 21, color: "#edf5ef", margin: "0 0 10px", fontWeight: 700 }}>
              {this.props.fallbackTitle || "Terjadi Kendala Memuat Modul"}
            </h2>
            <p style={{ color: "#93a69a", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
              Modul mengalami error saat memproses data. Anda dapat mencoba memuat ulang halaman atau kembali ke dasbor utama.
            </p>
            {this.state.error?.message && (
              <div
                style={{
                  background: "#080c09",
                  border: "1px solid #1a271e",
                  borderRadius: 6,
                  padding: "10px 14px",
                  fontSize: 11,
                  color: "#f87171",
                  textAlign: "left",
                  overflowX: "auto",
                  marginBottom: 24,
                  fontFamily: "monospace",
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: "#b8f36b",
                  color: "#0c100f",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Muat Ulang Halaman
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  background: "#1e3525",
                  color: "#b8f36b",
                  border: "1px solid #285836",
                  borderRadius: 6,
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Ke Dasbor Desain
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
