// Global variables for Firebase configuration and authentication
// These are provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// Fix: Changed 'initialAuthToken' to '__initial_auth_token' to correctly access the global variable
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Get references to DOM elements
const csvInput = document.getElementById('csv-input');
const tableContainer = document.getElementById('table-container');
const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');
const separator = document.getElementById('separator');
const appContainer = document.getElementById('app-container');

// Global variable to store the parsed CSV data
let csvData = [];

// Variables for column resizing
let isColumnResizing = false;
let currentResizableColumn = null;
let startColumnWidth = 0;
let startColumnX = 0;

/**
 * Parses a CSV string into a 2D array.
 * Correctly handles commas within double quotes and escaped double quotes ("").
 * @param {string} text The CSV string to parse.
 * @returns {Array<Array<string>>} A 2D array representing the CSV data.
 */
function parseCSV(text) {
    if (!text.trim()) {
        return [];
    }

    const lines = text.split(/\r?\n/);
    const parsedRows = [];

    // Regex to split by comma, but not if the comma is inside double quotes.
    // This regex works by looking for a comma that is followed by an even number of quotes.
    // It ensures that commas within quoted fields are not treated as delimiters.
    const commaSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    for (const line of lines) {
        if (!line.trim()) continue; // Skip empty lines

        // Split the line into fields using the robust regex
        const fields = line.split(commaSplitRegex);

        const row = fields.map(field => {
            // Trim whitespace from the field
            field = field.trim();

            // Check if the field is quoted (starts and ends with a double quote)
            if (field.startsWith('"') && field.endsWith('"')) {
                // Remove the surrounding quotes
                field = field.substring(1, field.length - 1);
                // Unescape double quotes (replace "" with ")
                field = field.replace(/""/g, '"');
            }
            return field;
        });
        parsedRows.push(row);
    }
    return parsedRows;
}


/**
 * Serializes a 2D array of data into a CSV string.
 * Correctly handles quoting fields that contain commas, double quotes, or newlines.
 * Escapes double quotes within fields by doubling them (" becomes "").
 * @param {Array<Array<string>>} data The 2D array to serialize.
 * @returns {string} The CSV string.
 */
function serializeCSV(data) {
    if (!data || data.length === 0) {
        return '';
    }

    return data.map(row => {
        return row.map(cell => {
            // Convert cell to string explicitly to handle non-string types
            let cellStr = String(cell);
            // Check if the cell contains a comma, double quote, or newline
            const needsQuotes = cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n') || cellStr.includes('\r');
            // Escape double quotes by doubling them
            cellStr = cellStr.replace(/"/g, '""');
            // If quotes are needed, enclose the cell in double quotes
            return needsQuotes ? `"${cellStr}"` : cellStr;
        }).join(','); // Join cells with a comma
    }).join('\n'); // Join rows with a newline
}

/**
 * Renders the parsed CSV data into an HTML table.
 * Makes table cells contenteditable for two-way binding.
 * Adds resize handles to table headers for column resizing.
 * @param {Array<Array<string>>} data The 2D array of CSV data.
 */
function renderTable(data) {
    tableContainer.innerHTML = ''; // Clear previous table

    if (!data || data.length === 0) {
        tableContainer.innerHTML = '<p class="p-4 text-gray-500 text-center">Enter CSV data on the left to see the table here.</p>';
        return;
    }

    const table = document.createElement('table');
    table.classList.add('min-w-full', 'bg-white', 'rounded-lg', 'shadow-sm');

    // Create table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    // Ensure there's at least one row for headers, even if data is just headers
    const headers = data[0] || [];
    headers.forEach((headerText, colIndex) => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.dataset.colIndex = colIndex; // Store column index for resizing

        // Add resize handle to each header
        const resizeHandle = document.createElement('div');
        resizeHandle.classList.add('resize-handle');
        resizeHandle.addEventListener('mousedown', (e) => startColumnResize(e, th));
        th.appendChild(resizeHandle);

        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create table body
    const tbody = document.createElement('tbody');
    // Start from the second row for data (index 1), if available
    for (let i = 1; i < data.length; i++) {
        const rowData = data[i];
        const tr = document.createElement('tr');
        rowData.forEach((cellText, colIndex) => {
            const td = document.createElement('td');
            td.textContent = cellText;
            td.setAttribute('contenteditable', 'true'); // Make cell editable
            td.dataset.rowIndex = i; // Store row index
            td.dataset.colIndex = colIndex; // Store column index

            // Add event listener for cell edits
            td.addEventListener('input', handleTableCellInput);
            // Add event listener for paste to ensure plain text
            td.addEventListener('paste', handleTableCellPaste);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableContainer.appendChild(table);
}

/**
 * Handles input events on contenteditable table cells.
 * Updates the global csvData array and then the textarea.
 * @param {Event} event The input event.
 */
function handleTableCellInput(event) {
    const target = event.target;
    const rowIndex = parseInt(target.dataset.rowIndex, 10);
    const colIndex = parseInt(target.dataset.colIndex, 10);
    const newValue = target.textContent;

    // Update the in-memory data
    if (csvData[rowIndex] && csvData[rowIndex][colIndex] !== undefined) {
        csvData[rowIndex][colIndex] = newValue;
        // Update the textarea
        csvInput.value = serializeCSV(csvData);
    }
}

/**
 * Handles paste events on contenteditable table cells to ensure plain text is pasted.
 * @param {Event} event The paste event.
 */
function handleTableCellPaste(event) {
    event.preventDefault(); // Prevent default paste behavior
    const text = (event.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text); // Insert plain text
}

// --- Event Listeners for Two-Way Binding ---

// Textarea to Table: Update table when textarea content changes
csvInput.addEventListener('input', () => {
    csvData = parseCSV(csvInput.value);
    renderTable(csvData);
});

// --- Resizable Panel Separator Logic ---
let isDraggingPanel = false;
let initialMouseXPanel;
let initialLeftPanelWidth;

separator.addEventListener('mousedown', (e) => {
    isDraggingPanel = true;
    initialMouseXPanel = e.clientX;
    // Get current computed width of the left panel
    initialLeftPanelWidth = leftPanel.offsetWidth;
    // Add a class to body to prevent text selection during drag
    document.body.classList.add('select-none');
    // Set cursor for dragging feedback
    document.body.style.cursor = 'ew-resize';
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingPanel) return;

    const deltaX = e.clientX - initialMouseXPanel;
    let newLeftPanelWidth = initialLeftPanelWidth + deltaX;

    // Get the total width of the app container
    const appContainerWidth = appContainer.offsetWidth;
    const separatorWidth = separator.offsetWidth;

    // Calculate max and min widths for left panel
    const minLeftWidth = 100; // Minimum width for left panel
    const minRightWidth = 100; // Minimum width for right panel
    const maxLeftWidth = appContainerWidth - separatorWidth - minRightWidth;

    // Clamp the new width within reasonable bounds
    newLeftPanelWidth = Math.max(minLeftWidth, Math.min(newLeftPanelWidth, maxLeftWidth));

    // Set the width directly. Using 'px' for direct drag control.
    leftPanel.style.width = `${newLeftPanelWidth}px`;
    rightPanel.style.width = `${appContainerWidth - newLeftPanelWidth - separatorWidth}px`; // Adjust right panel width
});

document.addEventListener('mouseup', () => {
    isDraggingPanel = false;
    document.body.classList.remove('select-none');
    document.body.style.cursor = 'default';
});

// --- Column Resizing Logic ---

/**
 * Initiates the column resizing process.
 * @param {MouseEvent} e The mousedown event.
 * @param {HTMLElement} thElement The table header (<th>) element being resized.
 */
function startColumnResize(e, thElement) {
    e.preventDefault(); // Prevent text selection on drag
    isColumnResizing = true;
    currentResizableColumn = thElement;
    startColumnWidth = thElement.offsetWidth;
    startColumnX = e.clientX;

    // Add global event listeners for dragging
    document.addEventListener('mousemove', doColumnResize);
    document.addEventListener('mouseup', stopColumnResize);
    document.body.classList.add('select-none'); // Prevent text selection
    document.body.style.cursor = 'col-resize'; // Change cursor
}

/**
 * Handles the column resizing during mouse movement.
 * @param {MouseEvent} e The mousemove event.
 */
function doColumnResize(e) {
    if (!isColumnResizing) return;

    const diffX = e.clientX - startColumnX;
    let newWidth = startColumnWidth + diffX;

    // Ensure minimum width for the column
    const minColumnWidth = 50;
    if (newWidth < minColumnWidth) {
        newWidth = minColumnWidth;
    }

    currentResizableColumn.style.width = `${newWidth}px`;
    // Also update the width of corresponding cells in the tbody
    const colIndex = parseInt(currentResizableColumn.dataset.colIndex, 10);
    const rows = tableContainer.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cell = row.children[colIndex];
        if (cell) {
            cell.style.width = `${newWidth}px`;
        }
    });
}

/**
 * Stops the column resizing process.
 * @param {MouseEvent} e The mouseup event.
 */
function stopColumnResize(e) {
    isColumnResizing = false;
    currentResizableColumn = null;
    document.removeEventListener('mousemove', doColumnResize);
    document.removeEventListener('mouseup', stopColumnResize);
    document.body.classList.remove('select-none');
    document.body.style.cursor = 'default';
}


// Initialize the table with any pre-filled textarea content on load
document.addEventListener('DOMContentLoaded', () => {
    csvData = parseCSV(csvInput.value);
    renderTable(csvData);
});

// Optional: Example CSV data to pre-fill the textarea
csvInput.value = `Name,Age,City,Occupation
John Doe,30,New York,Engineer
Jane Smith,25,London,Designer
"Peter Jones",40,"Paris, France",Artist
"Alice ""Wonderland"" Brown",35,Berlin,"Data Scientist, Senior"
Bob,28,Tokyo,Developer`;

// Trigger initial rendering
csvInput.dispatchEvent(new Event('input'));