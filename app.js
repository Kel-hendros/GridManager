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
    this.rowStartInput = document.getElementById("rowStartValue");
    this.colStartInput = document.getElementById("colStartValue");
    this.invertRowsInput = document.getElementById("invertRows");
    this.invertColsInput = document.getElementById("invertCols");

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

    this.canvasTitle = document.getElementById("canvasTitle");
    this.recenterBtn = document.getElementById("recenterBtn");

    // Multi-section logic
    this.layoutModal = document.getElementById("layoutModal");
    this.importLayoutBtn = document.getElementById("importLayout");
    this.layoutJsonPaste = document.getElementById("layoutJsonPaste");
    this.confirmImportBtn = document.getElementById("confirmImport");
    this.manualSectionField = document.getElementById("manualSectionField");
    this.closeProjectBtn = document.getElementById("closeProject");

    // Sections Navigator
    this.sectionsNav = document.getElementById("sectionsNav");
    this.sectionsListContainer = document.getElementById(
      "sectionsListContainer",
    );
    this.stadiumNameSpan = document.getElementById("stadiumName");

    this.stadiumData = null;
    this.allSections = []; // List of leaf section codes (filtered)
    this.sectionsCache = {}; // { sectionCode: { gridData, rows, cols, rowOverrides, config } }
    this.sectionToParentMap = {}; // { leafCode: parentCode }
    this.currentSectionCode = "PISO_2/SECCION_503A";
    this.expandedNodes = new Set();

    // Project Stats & Export
    this.parentCountSpan = document.getElementById("parentCount");
    this.leafCountSpan = document.getElementById("leafCount");
    this.exportAllZipBtn = document.getElementById("exportAllZip");

    this.STORAGE_KEY = "stadium_grid_manager_data";

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadFromLocalStorage();
    if (!this.stadiumData) {
      this.resetGrid();
    }
  }

  setupEventListeners() {
    // Real-time Configuration Sync
    const configInputs = [
      this.rowsInput,
      this.colsInput,
      this.sectionInput,
      this.namingTypeInput,
      this.rowStartInput,
      this.colStartInput,
      this.invertRowsInput,
      this.invertColsInput,
      this.zeroPaddingInput,
      this.namePatternInput,
    ];

    configInputs.forEach((input) => {
      const eventType =
        input.tagName === "SELECT" || input.type === "checkbox"
          ? "change"
          : "input";
      input.addEventListener(eventType, () => {
        this.resetGrid();
        this.saveCurrentToCache();
      });
    });

    // Tool Picker
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

    // Bulk shortcuts
    this.applyNamingBtn.addEventListener("click", () => this.resetGrid());
    this.fillAllBtn.addEventListener("click", () => this.bulkSetType("seat"));
    this.clearAllBtn.addEventListener("click", () => this.bulkSetType("empty"));

    // Multi-section Events
    this.importLayoutBtn.addEventListener("click", () =>
      this.layoutModal.showModal(),
    );
    this.confirmImportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.processLayoutJson();
    });
    this.closeProjectBtn.addEventListener("click", () => this.resetProject());
    this.recenterBtn.addEventListener("click", () => this.recenterView());

    // Export
    this.exportBtn.addEventListener("click", () => this.exportToCSV());
    this.exportAllZipBtn.addEventListener("click", () => this.exportToZip());

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
    this.currentSectionCode = this.sectionCode;
    if (this.canvasTitle) this.canvasTitle.textContent = this.sectionCode;

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
    this.recenterView();
  }

  getRowLabel(rowIndex) {
    // rowIndex is 1-based physical index (1 = top)
    if (this.rowOverrides[rowIndex]) return this.rowOverrides[rowIndex];

    const type = this.namingTypeInput.value;
    const start = this.rowStartInput.value;
    const isInverted = this.invertRowsInput.checked;

    // Map physical index to logical index based on inversion
    const logicalIndex = isInverted ? this.rows - rowIndex + 1 : rowIndex;

    if (type === "alpha") {
      return this.calculateAlphaLabel(logicalIndex, start);
    } else {
      const startNum = parseInt(start) || 1;
      return (startNum + logicalIndex - 1).toString();
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
      this.saveCurrentToCache();
    }
  }

  formatColumn(colIndex) {
    // colIndex is 1-based physical index (1 = left)
    const start = parseInt(this.colStartInput.value) || 1;
    const isInverted = this.invertColsInput.checked;

    // Map physical index to logical index based on inversion
    const logicalIndex = isInverted ? this.cols - colIndex + 1 : colIndex;
    const actualNum = start + logicalIndex - 1;

    if (!this.zeroPaddingInput.checked) return actualNum.toString();

    // Padding logic relative to the maximum expected value
    const maxVal = start + this.cols - 1;
    let padLength = 2;
    if (maxVal >= 100) padLength = 3;
    if (maxVal >= 1000) padLength = 4;

    return actualNum.toString().padStart(padLength, "0");
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
      colHeader.textContent = this.formatColumn(c);
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
    this.saveCurrentToCache();
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
      this.saveCurrentToCache();
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
    this.saveCurrentToCache();
  }

  processLayoutJson() {
    try {
      const json = JSON.parse(this.layoutJsonPaste.value);
      this.stadiumData = json;
      this.allSections = [];
      this.extractLeafSections(json.sections || []);

      if (this.allSections.length > 0) {
        this.sectionsNav.style.display = "flex";
        this.stadiumNameSpan.textContent = json.name || "Stadium Layout";
        this.sectionInput.readOnly = true;
        this.layoutModal.close();

        this.updateProjectStats();

        // Initialize cache if empty for the first section
        const firstCode = this.allSections[0];
        if (!this.sectionsCache[firstCode]) {
          this.switchSection(firstCode);
        } else {
          this.renderSectionsList();
          this.switchSection(firstCode);
        }
        this.persistProject();
      } else {
        alert("No leaf sections (unnumbered: false) found in the JSON.");
      }
    } catch (e) {
      alert("Invalid JSON format.");
      console.error(e);
    }
  }

  extractLeafSections(sections, parentCode = null) {
    sections.forEach((s) => {
      // Filter out sections that should not be numbered
      if (s.unnumbered === true) return;

      if (s.sections && s.sections.length > 0) {
        this.extractLeafSections(s.sections, s.code);
      } else {
        // It's a leaf section for seating
        this.allSections.push(s.code);
        if (parentCode) {
          this.sectionToParentMap[s.code] = parentCode;
        }
      }
    });
  }

  updateProjectStats() {
    if (!this.stadiumData) return;

    let parentCount = 0;
    let leafCount = 0;

    const countRecursive = (sections) => {
      sections.forEach((s) => {
        if (s.unnumbered === true) return;
        if (s.sections && s.sections.length > 0) {
          parentCount++;
          countRecursive(s.sections);
        } else {
          leafCount++;
        }
      });
    };

    countRecursive(this.stadiumData.sections || []);
    this.parentCountSpan.textContent = parentCount;
    this.leafCountSpan.textContent = leafCount;
  }

  renderSectionsList() {
    this.sectionsListContainer.innerHTML = "";
    if (this.stadiumData && this.stadiumData.sections) {
      this.renderSectionTree(
        this.stadiumData.sections,
        this.sectionsListContainer,
      );
    }
  }

  renderSectionTree(sections, container) {
    let subtreeHasActive = false;
    let subtreeStatus = {
      totalLeaves: 0,
      configuredLeaves: 0,
    };

    sections.forEach((s) => {
      if (s.unnumbered === true) return;

      if (s.sections && s.sections.length > 0) {
        // Branch node
        const node = document.createElement("div");
        node.className = "tree-node";

        const header = document.createElement("div");
        header.className = "tree-header";

        const group = document.createElement("div");
        group.className = "tree-group";

        const { hasActive, stats } = this.renderSectionTree(s.sections, group);

        const allConfigured =
          stats.totalLeaves > 0 && stats.totalLeaves === stats.configuredLeaves;
        const nodeKey = `node_${s.code}`; // Unique key for the branch

        header.innerHTML = `
          <span class="tree-toggle">▶</span>
          <span class="status-dot ${allConfigured ? "configured" : "empty"}"></span>
          <span class="name">${s.name || s.code}</span>
          <span class="count">(${stats.totalLeaves})</span>
        `;

        header.onclick = () => {
          const isExpanded = group.classList.toggle("expanded");
          node.classList.toggle("expanded", isExpanded);
          if (isExpanded) this.expandedNodes.add(nodeKey);
          else this.expandedNodes.delete(nodeKey);
        };

        if (hasActive || this.expandedNodes.has(nodeKey)) {
          group.classList.add("expanded");
          node.classList.add("expanded");
        }
        if (hasActive) {
          subtreeHasActive = true;
        }

        subtreeStatus.totalLeaves += stats.totalLeaves;
        subtreeStatus.configuredLeaves += stats.configuredLeaves;

        node.appendChild(header);
        node.appendChild(group);
        container.appendChild(node);
      } else {
        // Leaf node
        const cached = this.sectionsCache[s.code];
        const hasSeats =
          cached && cached.gridData.some((c) => c.type === "seat");
        const isConfigured = !!cached && hasSeats;

        if (s.code === this.currentSectionCode) {
          subtreeHasActive = true;
        }

        subtreeStatus.totalLeaves += 1;
        if (isConfigured) subtreeStatus.configuredLeaves += 1;

        const button = document.createElement("button");
        button.className = `section-item ${s.code === this.currentSectionCode ? "active" : ""}`;
        button.innerHTML = `
          <span class="status-dot ${isConfigured ? "configured" : "empty"}"></span>
          <span class="name">${s.name || s.code}</span>
        `;
        button.onclick = () => this.switchSection(s.code);
        container.appendChild(button);
      }
    });

    return { hasActive: subtreeHasActive, stats: subtreeStatus };
  }

  switchSection(newCode) {
    if (
      !newCode ||
      (newCode === this.currentSectionCode && this.sectionsCache[newCode])
    )
      return;

    // 1. Save current state to cache before switching
    if (this.currentSectionCode) {
      this.saveCurrentToCache();
    }

    this.currentSectionCode = newCode;
    this.sectionInput.value = newCode;
    this.canvasTitle.textContent = newCode;

    if (this.sectionsCache[newCode]) {
      this.loadFromCache(newCode);
    } else {
      // Default initialization for a new section
      this.rowsInput.value = 10;
      this.colsInput.value = 15;
      this.rowOverrides = {};
      this.gridData = [];
      this.resetGrid(); // This will also call saveCurrentToCache
    }

    this.renderSectionsList();
    this.persistProject();
  }

  saveCurrentToCache() {
    if (!this.currentSectionCode) return;
    this.sectionsCache[this.currentSectionCode] = {
      gridData: JSON.parse(JSON.stringify(this.gridData)),
      rows: this.rows,
      cols: this.cols,
      rowOverrides: { ...this.rowOverrides },
      config: {
        rowStart: this.rowStartInput.value,
        colStart: this.colStartInput.value,
        namingType: this.namingTypeInput.value,
        invertRows: this.invertRowsInput.checked,
        invertCols: this.invertColsInput.checked,
        namePattern: this.namePatternInput.value,
        zeroPadding: this.zeroPaddingInput.checked,
      },
    };
    this.renderSectionsList();
    this.persistProject();
  }

  loadFromCache(code) {
    const cache = this.sectionsCache[code];
    const cfg = cache.config || {};

    this.rowsInput.value = cache.rows;
    this.colsInput.value = cache.cols;
    this.rowStartInput.value = cfg.rowStart || "1";
    this.colStartInput.value = cfg.colStart || "1";
    this.namingTypeInput.value = cfg.namingType || "numeric";
    this.invertRowsInput.checked = !!cfg.invertRows;
    this.invertColsInput.checked = !!cfg.invertCols;
    this.namePatternInput.value = cfg.namePattern || "$ROW-$COL";
    this.zeroPaddingInput.checked = !!cfg.zeroPadding;

    this.rowOverrides = cache.rowOverrides || {};
    this.gridData = cache.gridData;
    this.rows = cache.rows;
    this.cols = cache.cols;

    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateTransform();

    this.renderGrid();
    this.updateStats();
    this.canvasTitle.textContent = code;
    this.recenterView();
  }

  recenterView() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateTransform();
  }

  persistProject() {
    const data = {
      stadiumData: this.stadiumData,
      allSections: this.allSections,
      sectionsCache: this.sectionsCache,
      currentSectionCode: this.currentSectionCode,
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.stadiumData = data.stadiumData;
      this.currentSectionCode = data.currentSectionCode;
      this.sectionsCache = data.sectionsCache || {};

      if (this.currentSectionCode) {
        this.sectionInput.value = this.currentSectionCode;
        if (this.canvasTitle)
          this.canvasTitle.textContent = this.currentSectionCode;
      }

      if (this.stadiumData) {
        // Repopulate mappings
        this.allSections = [];
        this.sectionToParentMap = {};
        this.extractLeafSections(this.stadiumData.sections || []);

        this.sectionsNav.style.display = "flex";
        this.stadiumNameSpan.textContent =
          this.stadiumData.name || "Stadium Layout";
        this.sectionInput.readOnly = true;
        this.updateProjectStats();
        this.renderSectionsList();
        if (this.currentSectionCode) {
          this.loadFromCache(this.currentSectionCode);
        }
      }
    } catch (e) {
      console.error("Failed to load from localStorage", e);
    }
  }

  resetProject() {
    if (
      confirm(
        "Are you sure you want to close this project? All unsaved grid progress will be lost (cached data in localStorage will be cleared).",
      )
    ) {
      this.stadiumData = null;
      this.allSections = [];
      this.sectionsCache = {};
      this.currentSectionCode = "PISO_2/SECCION_503A";

      localStorage.removeItem(this.STORAGE_KEY);

      this.sectionsNav.style.display = "none";
      this.sectionInput.readOnly = false;
      this.sectionInput.value = this.currentSectionCode;
      this.canvasTitle.textContent = "";

      this.resetGrid();
    }
  }

  updateStats() {
    const seats = this.gridData.filter((c) => c.type === "seat").length;
    this.seatCountSpan.textContent = `Seats: ${seats}`;
    this.canvasInfoSpan.textContent = `${this.rows}x${this.cols} Grid`;
  }

  generateCSVContent(gridData, sectionCode) {
    const header = "Section,Row,Seat";
    const rows = [header];

    gridData.forEach((cell) => {
      if (cell.type === "seat") {
        const rowLabel = cell.rowLabel || this.getRowLabel(cell.row);
        rows.push(`${sectionCode},${rowLabel},${cell.code}`);
      }
    });

    return rows.join("\n");
  }

  exportToCSV() {
    const sectionCode = this.sectionInput.value || "SECTION";
    const csvContent = this.generateCSVContent(this.gridData, sectionCode);

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const fileName = sectionCode.replace(/[\/\\ ]/g, "_") + ".csv";
    link.setAttribute("download", fileName);
    link.click();
  }

  async exportToZip() {
    if (!this.stadiumData) {
      alert("No stadium data loaded.");
      return;
    }

    const zip = new JSZip();
    let filesAdded = 0;

    this.allSections.forEach((code) => {
      const data = this.sectionsCache[code];
      // Only export if worked on (or export all as requested?
      // Usually better to export all leaf sectors found in the layout)
      const gridToExport = data ? data.gridData : [];

      const csv = this.generateCSVContent(gridToExport, code);

      const parentCode = this.sectionToParentMap[code] || "OTHERS";
      const safeParent = parentCode.replace(/[\/\\ ]/g, "_");
      const safeLeaf = code.replace(/[\/\\ ]/g, "_");

      zip.folder(safeParent).file(`${safeLeaf}.csv`, csv);
      filesAdded++;
    });

    if (filesAdded === 0) {
      alert("No sections to export.");
      return;
    }

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");

      const stadiumSafe = (this.stadiumData.name || "stadium").replace(
        /\s+/g,
        "_",
      );
      link.setAttribute("href", url);
      link.setAttribute("download", `${stadiumSafe}_layout.zip`);
      link.click();
    } catch (err) {
      console.error("ZIP Generation failed", err);
      alert("Generation failed. Check console for details.");
    }
  }
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  window.manager = new GridManager();
});
