/**
 * Stadium Grid Manager - Logic
 */

class GridManager {
  constructor() {
    this.rows = 10;
    this.cols = 15;
    this.sectionCode = "PISO_2/SECCION_503A";
    this.gridData = []; // Array of objects {row, col, type, code}
    this.currentTool = "seat"; // 'seat', 'empty', 'edit'
    this.appContainer = document.getElementById("app");
    this.canvasContainer = document.querySelector(".canvas-container");
    this.appContainer.setAttribute("data-current-tool", this.currentTool);
    this.isMouseDown = false;

    // Transform state (Infinite Canvas)
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;

    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;
    this.panningThreshold = 5;
    this.dragDist = 0;

    // DOM Elements
    this.gridCanvas = document.getElementById("gridCanvas");
    this.rowsInput = document.getElementById("rows");
    this.colsInput = document.getElementById("cols");
    this.sectionInput = document.getElementById("sectionCode");
    this.namingTypeInput = document.getElementById("rowNamingType");
    this.startValueInput = document.getElementById("rowStartValue");
    this.updateBtn = document.getElementById("updateGrid");
    this.toolBtns = document.querySelectorAll(".tool-btn");
    this.exportBtn = document.getElementById("exportCsv");
    this.applyNamingBtn = document.getElementById("applyNaming");
    this.fillAllBtn = document.getElementById("fillAll");
    this.clearAllBtn = document.getElementById("clearAll");
    this.zeroPaddingInput = document.getElementById("zeroPadding");
    this.namePatternInput = document.getElementById("namePattern");
    this.seatCountSpan = document.getElementById("seatCount");
    this.canvasInfoSpan = document.getElementById("canvasInfo");

    this.rowOverrides = {}; // Map of physical row index (1-based) to custom string

    // Modal elements
    this.editModal = document.getElementById("editModal");
    this.editSeatCodeInput = document.getElementById("editSeatCode");
    this.saveSeatEditBtn = document.getElementById("saveSeatEdit");
    this.currentEditingCell = null;

    // Row Modal
    this.rowEditModal = document.getElementById("rowEditModal");
    this.editRowLabelInput = document.getElementById("editRowLabel");
    this.saveRowEditBtn = document.getElementById("saveRowEdit");
    this.currentEditingRow = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.resetGrid();
  }

  setupEventListeners() {
    // Toolbar
    this.updateBtn.addEventListener("click", () => {
      this.resetGrid();
    });

    this.toolBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.toolBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentTool = btn.dataset.tool;
        this.appContainer.setAttribute("data-current-tool", this.currentTool);
      });
    });

    // Infinite Canvas Events
    this.canvasContainer.addEventListener("mousedown", (e) =>
      this.handleGlobalMouseDown(e),
    );
    window.addEventListener("mousemove", (e) => this.handleGlobalMouseMove(e));
    window.addEventListener("mouseup", () => this.handleGlobalMouseUp());
    this.canvasContainer.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
    });

    // Prevent context menu on canvas for better UX
    this.gridCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Naming & Bulk
    this.applyNamingBtn.addEventListener("click", () => this.applyBulkNaming());
    this.fillAllBtn.addEventListener("click", () => this.bulkSetType("seat"));
    this.clearAllBtn.addEventListener("click", () => this.bulkSetType("empty"));

    // Config changes
    this.namingTypeInput.addEventListener("change", () => this.renderGrid());
    this.startValueInput.addEventListener("input", () => this.renderGrid());

    // Export
    this.exportBtn.addEventListener("click", () => this.exportToCSV());

    // Modal
    this.saveSeatEditBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.saveManualEdit();
    });

    this.saveRowEditBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.saveRowManualEdit();
    });
  }

  handleGlobalMouseDown(e) {
    const isCellValue = e.target.classList.contains("cell");

    if (!isCellValue || e.button === 1 || this.currentTool === "edit") {
      this.isPanning = true;
      this.startX = e.pageX - this.translateX;
      this.startY = e.pageY - this.translateY;
      this.dragDist = 0;
    }

    this.isMouseDown = true;
  }

  handleGlobalMouseMove(e) {
    if (this.isPanning) {
      this.translateX = e.pageX - this.startX;
      this.translateY = e.pageY - this.startY;
      this.updateTransform();
      this.dragDist += 1; // Simplified
    }
  }

  handleWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);

    const newScale = Math.min(Math.max(this.scale * factor, 0.1), 5);

    // Zoom towards mouse position (basic implementation)
    // For a true "zoom to mouse", more math is needed, but this feels good for now
    this.scale = newScale;
    this.updateTransform();
  }

  updateTransform() {
    this.gridCanvas.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;

    // Update background position to follow for "infinite" feel
    this.canvasContainer.style.backgroundPosition = `${this.translateX}px ${this.translateY}px`;
  }

  handleGlobalMouseUp() {
    this.isMouseDown = false;
    this.isPanning = false;
  }

  resetGrid() {
    const newRows = parseInt(this.rowsInput.value) || 10;
    const newCols = parseInt(this.colsInput.value) || 15;
    this.sectionCode = this.sectionInput.value || "SECTION";

    // Map old data for lookup: "row-col" -> {type, code}
    const oldDataMap = {};
    this.gridData.forEach((cell) => {
      oldDataMap[`${cell.row}-${cell.col}`] = {
        type: cell.type,
        code: cell.code,
      };
    });

    this.rows = newRows;
    this.cols = newCols;
    this.gridData = [];

    for (let r = 1; r <= this.rows; r++) {
      for (let c = 1; c <= this.cols; c++) {
        const key = `${r}-${c}`;
        if (oldDataMap[key]) {
          // Preserve existing type (Seat vs Empty), but refresh the code
          // to match current naming/padding strategy
          this.gridData.push({
            row: r,
            col: c,
            type: oldDataMap[key].type,
            code: this.generateCode(r, c),
          });
        } else {
          // New cell
          this.gridData.push({
            row: r,
            col: c,
            type: "seat",
            code: this.generateCode(r, c),
          });
        }
      }
    }

    this.renderGrid();
    this.updateStats();
  }

  getRowLabel(rowIndex) {
    // rowIndex is 1-based index in the physical grid
    if (this.rowOverrides[rowIndex]) return this.rowOverrides[rowIndex];

    const type = this.namingTypeInput.value;
    const start = this.startValueInput.value;

    if (type === "alpha") {
      return this.calculateAlphaLabel(rowIndex, start);
    } else {
      const startNum = parseInt(start) || 1;
      return (startNum + rowIndex - 1).toString();
    }
  }

  calculateAlphaLabel(rowIndex, start) {
    // Convert start string to base 26 number
    const getVal = (s) => {
      let res = 0;
      for (let i = 0; i < s.length; i++) {
        res = res * 26 + (s.charCodeAt(i) - 64);
      }
      return res;
    };
    const getStr = (v) => {
      let res = "";
      while (v > 0) {
        let m = (v - 1) % 26;
        res = String.fromCharCode(65 + m) + res;
        v = Math.floor((v - m) / 26);
      }
      return res || "A";
    };

    const startVal = getVal(start.toUpperCase().replace(/[^A-Z]/g, "A") || "A");
    return getStr(startVal + rowIndex - 1);
  }

  saveRowManualEdit() {
    if (this.currentEditingRow !== null) {
      const rowIndex = this.currentEditingRow;
      const newLabel = this.editRowLabelInput.value.trim();
      if (newLabel) {
        this.rowOverrides[rowIndex] = newLabel;
      } else {
        delete this.rowOverrides[rowIndex];
      }
      this.rowEditModal.close();
      this.renderGrid();
    }
  }

  formatColumn(col) {
    if (!this.zeroPaddingInput.checked) return col.toString();

    const maxVal = this.cols;
    let padLength = 2; // Default 01, 02
    if (maxVal >= 100) padLength = 3; // 001, 002
    if (maxVal >= 1000) padLength = 4;

    return col.toString().padStart(padLength, "0");
  }

  generateCode(row, col) {
    const pattern = this.namePatternInput
      ? this.namePatternInput.value
      : "$ROW-$COL";
    const colVal = this.formatColumn(col);
    const rowLabel = this.getRowLabel(row);

    return pattern.replace("$ROW", rowLabel).replace("$COL", colVal);
  }

  renderGrid() {
    // Add one column for labels
    this.gridCanvas.style.gridTemplateColumns = `40px repeat(${this.cols}, 32px)`;
    this.gridCanvas.innerHTML = "";

    // Add Header Row (Column identifiers)
    // First cell is corner (empty)
    const corner = document.createElement("div");
    corner.className = "cell label header-corner";
    this.gridCanvas.appendChild(corner);

    for (let c = 1; c <= this.cols; c++) {
      const colHeader = document.createElement("div");
      colHeader.className = "cell label col-header";
      colHeader.textContent = c; // Columns are usually just numbers
      this.gridCanvas.appendChild(colHeader);
    }

    for (let r = 1; r <= this.rows; r++) {
      // Add Label Cell
      const labelCell = document.createElement("div");
      labelCell.className = "cell label";
      labelCell.textContent = this.getRowLabel(r);

      labelCell.addEventListener("click", () => {
        if (this.currentTool === "edit") {
          this.currentEditingRow = r;
          this.editRowLabelInput.value = this.getRowLabel(r);
          this.rowEditModal.showModal();
        }
      });

      this.gridCanvas.appendChild(labelCell);

      // Add Row Cells
      const rowCells = this.gridData.filter((c) => c.row === r);
      rowCells.forEach((cell) => {
        const index = this.gridData.indexOf(cell);
        const cellEl = document.createElement("div");
        cellEl.className = `cell ${cell.type}`;
        cellEl.dataset.index = index;
        cellEl.textContent = cell.type === "seat" ? cell.code : "";
        cellEl.addEventListener("mousedown", (e) => {
          if (e.button === 0) this.handleCellAction(index);
        });
        cellEl.addEventListener("mouseover", () => {
          if (this.isMouseDown && !this.isPanning) this.handleCellAction(index);
        });

        this.gridCanvas.appendChild(cellEl);
      });
    }
  }

  handleCellAction(index) {
    const cell = this.gridData[index];
    // Find the actual DOM element using its dataset.index
    const cellEl = this.gridCanvas.querySelector(
      `.cell[data-index="${index}"]`,
    );

    if (this.currentTool === "seat") {
      cell.type = "seat";
      if (cellEl) {
        // Ensure element exists before modifying
        cellEl.className = "cell seat";
        cellEl.textContent = cell.code;
      }
    } else if (this.currentTool === "empty") {
      cell.type = "empty";
      if (cellEl) {
        // Ensure element exists before modifying
        cellEl.className = "cell empty";
        cellEl.textContent = "";
      }
    } else if (this.currentTool === "edit" && !this.isMouseDown) {
      // Only open edit on single click, not brush
      this.openEditModal(index);
    }

    this.updateStats();
  }

  openEditModal(index) {
    this.currentEditingCell = index;
    this.editSeatCodeInput.value = this.gridData[index].code;
    this.editModal.showModal();
  }

  saveManualEdit() {
    if (this.currentEditingCell !== null) {
      const index = this.currentEditingCell;
      const newCode = this.editSeatCodeInput.value.trim();
      this.gridData[index].code = newCode;
      this.gridData[index].type = "seat"; // Automatically become seat if edited

      // Find the actual DOM element using its dataset.index
      const cellEl = this.gridCanvas.querySelector(
        `.cell[data-index="${index}"]`,
      );
      if (cellEl) {
        // Ensure element exists before modifying
        cellEl.className = "cell seat";
        cellEl.textContent = newCode;
      }

      this.editModal.close();
      this.updateStats();
    }
  }

  bulkSetType(type) {
    this.gridData.forEach((cell, index) => {
      cell.type = type;
      // Find the actual DOM element using its dataset.index
      const cellEl = this.gridCanvas.querySelector(
        `.cell[data-index="${index}"]`,
      );
      if (cellEl) {
        // Ensure element exists before modifying
        cellEl.className = `cell ${type}`;
        cellEl.textContent = type === "seat" ? cell.code : "";
      }
    });
    this.updateStats();
  }

  applyBulkNaming() {
    const pattern = this.namePatternInput.value;
    this.gridData.forEach((cell, index) => {
      if (cell.type === "seat") {
        const colVal = this.formatColumn(cell.col);
        let newCode = pattern
          .replace("$ROW", this.getRowLabel(cell.row)) // Use getRowLabel here
          .replace("$COL", colVal);
        cell.code = newCode;

        // Find the actual DOM element using its dataset.index
        const cellEl = this.gridCanvas.querySelector(
          `.cell[data-index="${index}"]`,
        );
        if (cellEl) {
          // Ensure element exists before modifying
          cellEl.textContent = newCode;
        }
      }
    });
  }

  updateStats() {
    const seats = this.gridData.filter((c) => c.type === "seat").length;
    this.seatCountSpan.textContent = `Seats: ${seats}`;
    this.canvasInfoSpan.textContent = `${this.rows}x${this.cols} Grid`;
  }

  exportToCSV() {
    this.sectionCode = this.sectionInput.value || "SECTION";

    let csvContent = "rowNumber,sectionCode,seatCode\n";

    this.gridData.forEach((cell) => {
      const rowIdentifier = this.getRowLabel(cell.row);
      const seatCode = cell.type === "seat" ? cell.code : "NOT_SEAT";
      csvContent += `${rowIdentifier},${this.sectionCode},${seatCode}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `grid_${this.sectionCode.replace(/[\/\s]/g, "_")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  window.manager = new GridManager();
});
