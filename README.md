# Workday Schedule Extractor

A powerful Chrome extension that transforms your Workday course registration page into an interactive schedule management tool. Extract, organize, filter, and export your registered courses in a single click.

## 🎯 Features

- **Course Extraction**: Automatically parse and extract course data from Workday's "View My Courses" page
- **Interactive Schedule View**: Visualize your courses in a calendar-style grid layout
- **Advanced Filtering & Sorting**: Filter courses by code, name, or credits; sort by any column
- **Multiple Schedule Snapshots**: Save and manage multiple schedule versions to compare different registration options
- **iCalendar Export**: Download your schedule as `.ics` file for use with Google Calendar, Outlook, Apple Calendar, and other calendar apps
- **Professional UI**: Dark/light theme support with custom styling specific to Workday's interface
- **Real-time Updates**: Reactive UI that updates instantly when you filter, sort, or switch views

## 🚀 Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/gwan-kib/Workday-Extension.git
   cd Workday-Extension
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the extension**

   ```bash
   npm run build
   ```

4. **Load into Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the project directory

5. **Use the extension**
   - Navigate to your Workday instance (https://\*.myworkday.com)
   - Click the extension icon to open the course extraction panel
   - View, filter, sort, and export your schedule

## 📚 What I Learned Building This

### Architecture & JavaScript

- **Chrome Extension Architecture**: Manifest v3 configuration, content scripts, background service workers, and communication between different extension contexts
- **Shadow DOM & DOM Manipulation**: Mounting UI into Shadow DOM to prevent style conflicts with host page, dynamic DOM updates with efficient rendering
- **Reactive State Management**: Built a centralized STATE object pattern to manage application state and trigger reactive updates across the UI
- **Event Handling & Debouncing**: Implemented debounced event listeners to optimize performance during frequent user interactions

### Web Scraping & Data Processing

- **DOM Parsing**: Built sophisticated grid parsing logic to extract structured data from unstructured HTML tables
- **Text Normalization**: Handled messy Workday data with regex patterns and text parsing utilities to extract meeting times, dates, instructors, and course codes
- **Data Transformation**: Converted raw course data into structured objects with proper typing and validation

### Calendar & Time Handling

- **iCalendar Format (RFC 5545)**: Generated valid `.ics` files with proper timezone handling, recurring events (RRULE), and UTC/local time conversions
- **Date Manipulation**: Complex date parsing and formatting for multiple calendar systems and timezone awareness

### Build Tools & Module Systems

- **Vite Bundler**: Configured multiple Vite builds for content scripts and background workers with asset copying and code splitting
- **ES6 Modules**: Organized code into modular, reusable components with clear dependency injection

### UI/UX Development

- **Component-Based UI**: Built reusable UI components for different views (course list, schedule grid, settings, help)
- **CSS Architecture**: Organized styling into logical modules (colors, formatting, themes) with CSS variables for maintainability
- **Responsive Design**: Created an interface that works within Chrome's extension constraints

### Development Practices

- **Debugging**: Implemented custom debug utilities for efficient logging across the extension
- **Code Organization**: Structured the codebase into logical modules (extraction, mainPanel, exportLogic, utilities, css)
- **Error Handling**: Built robust parsing with fallbacks for malformed data

## 🏗️ Project Structure

```
src/
├── core/                    # Global state management
├── extraction/              # Course data parsing from Workday
│   ├── parsers/            # Specialized parsers (meeting patterns, instructors, sections)
│   └── grid.js             # Workday table structure analysis
├── mainPanel/              # UI rendering & interactions
│   ├── scheduleStorage.js  # Schedule snapshots (save/load)
│   └── scheduleView.js     # Calendar grid visualization
├── exportLogic/            # iCalendar generation
├── utilities/              # Shared helpers (DOM, Shadow DOM, debugging)
└── css/                    # Styling (colors, formatting, themes)
```

## 🛠️ Development

**Watch mode for development:**

```bash
npm run dev
```

**Build for production:**

```bash
npm run build
```

The extension uses two separate Vite configurations:

- `vite.content.config.js` - Bundles content scripts injected into Workday pages
- `vite.background.config.js` - Bundles background service worker

## 📋 How It Works

1. **Content Script Injection**: When you visit a Workday page, the content script initializes
2. **Grid Detection & Parsing**: Analyzes the page's DOM to find and extract the course table
3. **Data Extraction**: Parses each row to extract course codes, names, instructors, meeting patterns, and credits
4. **UI Rendering**: Mounts an interactive panel into a Shadow DOM to avoid style conflicts
5. **State Management**: All interactions (filtering, sorting, switching views) update the centralized STATE
6. **Export Generation**: When requested, generates a proper RFC 5545-compliant `.ics` file with recurring events and timezone data

## ⚙️ Technical Details

**Permissions & Security:**

- Only requests access to `*.myworkday.com` domains
- Uses `chrome.storage.local` for schedule snapshots
- No external data transmission

**Browser Support:**

- Chrome 88+ (Manifest v3 required)

## 📄 License

ISC

---

**Built as a learning project to explore Chrome extension development, DOM manipulation, and calendar standards.**
