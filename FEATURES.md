# Features Overview

## Document Management

### 📋 View Documents in Store
- Browse all documents currently in your Gemini File Search store
- See comprehensive details for each document:
  - Display name
  - File size (formatted)
  - MIME type
  - Creation date
  - Current state (Active/Inactive)
- Clean, modern card-based interface with hover effects

### 🔄 Pagination Support
- Load documents in batches for better performance
- "Load More" button appears when more documents are available
- Shows document count with indicator for additional documents
- Smooth loading experience even with large stores

### 🗑️ Delete Documents
- One-click delete with trash icon button
- **Safety first**: Confirmation modal before deletion
  - Shows document name being deleted
  - Warning that action cannot be undone
  - Cancel or confirm options
- Instant UI update after successful deletion
- Graceful error handling if deletion fails

## File Upload

### 📁 File Selection
- Standard file picker interface
- Multi-file selection support
- File extension filtering (customizable)
- Visual preview of selected files before upload
- Remove individual files from queue

### ⬆️ Smart Upload Process
- Direct upload to File Search store (no intermediate storage)
- ASCII-safe filename conversion
  - Handles special characters and Unicode
  - Example: `Bachelor's Degree – Haifa.pdf` → `Bachelors_Degree_-_Haifa.pdf`
- Real-time progress tracking with visual indicators
- Status updates during upload:
  1. Preparing file
  2. Uploading
  3. Processing
  4. Complete/Failed

### 📊 Upload Status Tracking
- Individual progress bars for each file
- Color-coded status badges:
  - 🟡 Uploading (yellow)
  - 🟢 Success (green)
  - 🔴 Error (red)
- Detailed error messages if upload fails
- Automatic addition to document list after successful upload

## Configuration

### 🔐 Secure Settings
- API key stored locally in browser (localStorage)
- Password field for API key (hidden characters)
- Store name validation
- Extension filter customization
- Auto-save on every change
- Persistent across sessions

### 💾 Local Storage
All settings saved automatically:
- Google API key
- File Search store name
- Allowed file extensions

## User Experience

### 🎨 Modern UI Design
- Dark theme with gradient accents
- Smooth animations and transitions
- Responsive layout (mobile-friendly)
- Hover effects and visual feedback
- Loading states and spinners
- Toast notifications for actions

### 🔔 Smart Notifications
- Success messages (green)
- Error alerts (red)
- Warning messages (yellow)
- Info notifications (blue)
- Auto-dismiss after 5 seconds
- Manual close button
- Slide-in animation from top-right

### ⚡ Performance
- Client-side processing (no backend needed)
- Efficient file handling with HTML5 APIs
- Lazy loading with pagination
- Optimized API calls
- Smooth UI updates

## API Integration

### Endpoints Used

**List Documents**
```
GET /v1beta/{storeName}/documents?key={apiKey}&pageToken={token}
```

**Upload Document**
```
POST /v1beta/{storeName}/documents:upload?key={apiKey}
```

**Get Document Status**
```
GET /v1beta/{storeName}/documents/{documentName}?key={apiKey}
```

**Delete Document**
```
DELETE /v1beta/{storeName}/documents/{documentName}?key={apiKey}&force=true
```

### Error Handling
- Network error detection
- Invalid API key warnings
- Store not found errors
- File processing failures
- Timeout handling
- User-friendly error messages

## Browser Compatibility

Works in all modern browsers:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

Requires support for:
- File API
- Fetch API
- FormData
- localStorage
- ES6+ JavaScript

## Security

- 🔒 API keys never sent to third parties
- 🔒 Files processed locally in browser
- 🔒 Direct communication with Google APIs only
- 🔒 No tracking or analytics
- 🔒 No server-side code
- 🔒 Open source and auditable

## Keyboard Shortcuts

- `Esc` - Close confirmation modal
- `Enter` - Confirm deletion (when modal is open)
- Standard file picker shortcuts work

## Future Enhancements (Potential)

- 🔮 Drag and drop file upload
- 🔮 Bulk delete with checkboxes
- 🔮 Search/filter documents
- 🔮 Sort documents by name, date, size
- 🔮 Download documents
- 🔮 Document preview
- 🔮 Folder organization
- 🔮 Export document list
- 🔮 Dark/light theme toggle
- 🔮 Multiple store management
