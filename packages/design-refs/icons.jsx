/* global React */
// Icons — minimal stroke 1.5 line set drawn inline as SVG components
const Icon = ({ d, size = 16, stroke = 1.5, fill = "none", style, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} {...rest}>
    {d}
  </svg>
);

const I = {
  Home: (p) => <Icon {...p} d={<><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></>}/>,
  Tasks: (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></>}/>,
  Workspace: (p) => <Icon {...p} d={<><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></>}/>,
  Folder: (p) => <Icon {...p} d={<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>}/>,
  Memory: (p) => <Icon {...p} d={<><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="14" r="2.5"/><circle cx="6" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/><path d="M7.5 7.5L10.5 12.5M16.5 7.5L13.5 12.5M11 15.5L7 18M13 15.5L17 18"/></>}/>,
  Skills: (p) => <Icon {...p} d={<><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z"/></>}/>,
  Plug: (p) => <Icon {...p} d={<><path d="M9 4v4M15 4v4M7 8h10v4a5 5 0 01-10 0V8zM12 17v4"/></>}/>,
  Calendar: (p) => <Icon {...p} d={<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>}/>,
  Box: (p) => <Icon {...p} d={<><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></>}/>,
  Settings: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1A2 2 0 114.3 17l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1A2 2 0 117 4.3l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></>}/>,

  Send: (p) => <Icon {...p} d={<><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></>}/>,
  Plus: (p) => <Icon {...p} d={<><path d="M12 5v14M5 12h14"/></>}/>,
  Search: (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>}/>,
  Filter: (p) => <Icon {...p} d={<><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>}/>,
  Chevron: (p) => <Icon {...p} d={<path d="M9 18l6-6-6-6"/>}/>,
  ChevronDown: (p) => <Icon {...p} d={<path d="M6 9l6 6 6-6"/>}/>,
  Up: (p) => <Icon {...p} d={<path d="M18 15l-6-6-6 6"/>}/>,
  More: (p) => <Icon {...p} d={<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>}/>,
  Close: (p) => <Icon {...p} d={<path d="M18 6L6 18M6 6l12 12"/>}/>,
  Check: (p) => <Icon {...p} d={<path d="M5 12l5 5 9-12"/>}/>,
  CheckCircle: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></>}/>,
  Alert: (p) => <Icon {...p} d={<><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r="0.5" fill="currentColor"/></>}/>,
  Info: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/></>}/>,
  Lock: (p) => <Icon {...p} d={<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></>}/>,
  Shield: (p) => <Icon {...p} d={<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></>}/>,

  Globe: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>}/>,
  Terminal: (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h5"/></>}/>,
  Cursor: (p) => <Icon {...p} d={<path d="M5 3l14 6-6 2-2 6z"/>}/>,
  Browser: (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="9" cy="6.5" r="0.5" fill="currentColor"/></>}/>,
  Code: (p) => <Icon {...p} d={<><path d="M9 8l-5 4 5 4M15 8l5 4-5 4"/></>}/>,
  Phone: (p) => <Icon {...p} d={<><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 19h2"/></>}/>,
  Layers: (p) => <Icon {...p} d={<><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 18l9 5 9-5"/></>}/>,
  Sparkles: (p) => <Icon {...p} d={<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.5 2.5M16 16l2.5 2.5M5.5 18.5L8 16M16 8l2.5-2.5"/></>}/>,
  Database: (p) => <Icon {...p} d={<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>}/>,
  Zap: (p) => <Icon {...p} d={<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>}/>,
  Pause: (p) => <Icon {...p} d={<><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>}/>,
  Stop: (p) => <Icon {...p} d={<rect x="5" y="5" width="14" height="14" rx="2"/>}/>,
  Play: (p) => <Icon {...p} d={<path d="M6 4l14 8-14 8z"/>}/>,
  Refresh: (p) => <Icon {...p} d={<><path d="M3 12a9 9 0 0115-6.7L21 8M21 4v4h-4M21 12a9 9 0 01-15 6.7L3 16M3 20v-4h4"/></>}/>,
  Download: (p) => <Icon {...p} d={<><path d="M12 4v12M6 11l6 6 6-6M4 21h16"/></>}/>,
  Attach: (p) => <Icon {...p} d={<path d="M21.4 11.6l-9 9a5 5 0 01-7-7L14 5a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"/>}/>,
  ArrowUp: (p) => <Icon {...p} d={<path d="M12 19V5M5 12l7-7 7 7"/>}/>,
  Copy: (p) => <Icon {...p} d={<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V4a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h4"/></>}/>,
  Edit: (p) => <Icon {...p} d={<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z"/></>}/>,
  Trash: (p) => <Icon {...p} d={<><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></>}/>,
  Pin: (p) => <Icon {...p} d={<><path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v6"/></>}/>,
  GitBranch: (p) => <Icon {...p} d={<><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 4-6 4-6 8"/></>}/>,
  Eye: (p) => <Icon {...p} d={<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}/>,
  ExternalLink: (p) => <Icon {...p} d={<><path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6"/></>}/>,
  ArrowRight: (p) => <Icon {...p} d={<path d="M5 12h14M13 5l7 7-7 7"/>}/>,
  Mic: (p) => <Icon {...p} d={<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6"/></>}/>,
  Image: (p) => <Icon {...p} d={<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></>}/>,
  Users: (p) => <Icon {...p} d={<><circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="7" r="2.5"/><path d="M16 14c3 0 6 2 6 5"/></>}/>,
  Star: (p) => <Icon {...p} d={<path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8L6.7 19.6l1-6L3.3 9.4l6-.9z"/>}/>,
  Logo: (p) => (
    <svg width={p?.size || 22} height={p?.size || 22} viewBox="0 0 24 24" {...p}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="oklch(0.62 0.18 250)"/>
      <path d="M8 7v10M8 12h8M16 7v10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

window.I = I;
window.Icon = Icon;
