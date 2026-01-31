# Workday - Schedule Tool

A Chrome extension that allows you to view, extract, and export your Workday courses and schedules with ease.

## Features

- **Schedule View**: Visualize your courses in a calendar-style grid layout
- **Filtering & Sorting**: Filter courses by code, name, or credits
- **Save Multiple Schedules**: Save and manage multiple schedule versions to compare different registration options
- **Calendar Export**: Download your schedule as `.ics` file for use with Google Calendar, Outlook, Apple Calendar, ect.

## Want to work on the extension?

1. **Clone the repository**

   ```bash
   git clone https://github.com/gwan-kib/Workday-Extension.git
   cd Workday-Extension
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

   The extension uses two separate Vite configurations:

- `vite.content.config.js` - Bundles content scripts injected into Workday pages
- `vite.background.config.js` - Bundles background service worker

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
   - Navigate to any Workday instance (https://\*.myworkday.com) and have fun

## What I Learned Building This

### Architecture & JavaScript

- **Chrome Extension Architecture**: Manifest v3 configuration, content scripts, background service workers, and communication between different extension contexts
- **Shadow DOM & DOM Manipulation**: Mounting UI into Shadow DOM to prevent style conflicts with host page, dynamic DOM updates with efficient rendering
- **Reactive State Management**: Built a centralized STATE object pattern to manage application state and trigger reactive updates across the UI
- **Event Handling & Debouncing**: Implemented debounced event listeners to optimize performance during frequent user interactions

### Web Scraping & Data Processing

- **DOM Parsing**: Built grid parsing logic to extract structured data from HTML tables
- **Text Normalization**: Handled messy Workday data with regex patterns and text parsing utilities to extract meeting times, dates, instructors, and course codes
- **Data Transformation**: Converted raw course data into structured objects with proper typing and validation

### Calendar & Time Handling

- **iCalendar Format (RFC 5545)**: Generated valid `.ics` files with proper timezone handling, recurring events (RRULE), and UTC/local time conversions
- **Date Manipulation**: Date parsing and formatting for multiple calendar systems and timezone awareness

### UI/UX Development

- **Component-Based UI**: Built reusable UI components (buttons, links) for the different extension panel views (course list, schedule grid, settings, help)
- **CSS Architecture**: Organized styling into logical modules (colours, formatting, themes) with CSS variables for maintainability
- **Responsive Design**: Created an interface that works within Chrome's extension constraints

### Development Practices

- **Debugging**: Implemented custom debug utilities for efficient logging across the extension
- **Code Organization**: Structured the codebase into logical modules (extraction, mainPanel, exportLogic, utilities, css)
- **Error Handling**: Built robust parsing with fallbacks for malformed data

## Project Structure

```

```

## How It Works

1. **Inject Content Script**: When you visit a Workday page, the content script initializes
2. **Grid Parsing**: Analyzes the page's DOM to find and extract the course table
3. **Data Extraction**: Parses each row to extract course codes, names, instructors, meeting patterns, and credits
4. **UI Rendering**: Mounts an interactive panel into a Shadow DOM to avoid style conflicts
5. **State Management**: All interactions (filtering, sorting, switching views) update the centralized STATE
6. **Export Generation**: When requested, generates a proper RFC 5545-compliant `.ics` file with recurring events and timezone data

## Technical Details

**Permissions & Security:**

- Only requests access to `*.myworkday.com` domains
- Uses `chrome.storage.local` for schedule snapshots
- No external data transmission

**Browser Support:**

- Chrome 88+ (Manifest v3 required)

---

## License

ISC


**Built as a learning project to explore Chrome extension development, DOM manipulation, and UI/UX development.**