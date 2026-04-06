# Project Documentation: gotfoth. | Study Vault

## 1. Project Overview
**gotfoth. | Study Vault** is a bespoke educational management dashboard designed for tracking AS-Level academic progress. It serves as a private "vault" for exam papers, mark schemes, and student attempts, utilizing AI-driven grading to provide immediate performance feedback.

---

## 2. Infrastructure & Environment
The project is built specifically to operate within the constraints of a **Private Local Area Network (NAS-based environment)**.

* **Hosting Hardware:** Western Digital MyCloud EX2 Ultra (NAS).
* **Orchestration Layer:** **Portainer (Docker)** is used to manage the backend lifecycle. It handles container deployment, environment variables, and persistent data volumes, ensuring the database remains stable across NAS reboots.
* **Backend Engine:** **PocketBase** (running as a Docker container) serves as the database, authentication provider, and file server.
* **Networking:** The application is hosted locally (`http://mycloudex2ultra.local:8090`), ensuring all sensitive academic data and scanned documents never leave the local network.
* **Storage:** Exam PDFs and student scans are stored directly on the NAS file system via Docker-managed volumes.



---

## 3. Functional Goals
The application is designed to solve the friction of manual revision tracking and grading:

* **Centralized Exam Repository:** Organize past papers (Business and Psychology) alongside their respective mark schemes and student scans in a secure "Vault."
* **AI-Assisted Grading:** Utilize **Gemini AI** to analyze student scans against mark schemes, returning a percentage score and qualitative feedback in a structured YAML format.
* **Automated Grade Calculation:** Cross-reference percentage scores against official exam board grade boundaries (A–E) to provide realistic AS-Level grading.
* **Visual Progress Tracking:** * **Success Heatmap:** A calendar view that turns green when scheduled papers are completed and marked.
    * **Performance Analytics:** Line charts (via Chart.js) to track score trends over time.
    * **Exam Countdowns:** Real-time day counters for upcoming exam dates.

---

## 4. Technical Implementation & Architecture
The project is coded using a "Modern Vanilla" stack to ensure maximum performance when served from lower-power NAS hardware.

### Data Architecture
The system uses a relational-style structure within PocketBase:
* **`papers` Collection:** Stores metadata (title, subject, scheduled date), status flags (Planned vs. Marked), percentage scores, and multi-file attachments (Paper, Scheme, Attempt).
* **`boundaries` Collection:** A lookup table containing `paper_key` identifiers and their corresponding raw mark requirements for each grade.

### Frontend Logic
* **Vanilla JavaScript:** The application avoids heavy frameworks to minimize load times. It uses `async/await` for API communication and dynamic DOM manipulation for UI updates.
* **The Grading "Handshake":** Logic in `js/domain/grade.js` and `js/main.js` matches a paper's `paper_type` (e.g., "Psychology P1") to `boundaries.paper_key`, calculating the letter grade from percentage score and `max_mark`.
* **Tailwind CSS:** Utilizes a utility-first CSS approach (via CDN) to create a professional, high-contrast "SaaS-style" interface with responsive sidebar navigation.



### Workflow Sequence
1.  **Deposit:** User uploads a paper to the "NAS Vault."
2.  **Mark:** User provides Gemini AI's feedback via a YAML prompt.
3.  **Sync:** The system extracts the score and updates the `papers` record.
4.  **Display:** The dashboard re-renders, displaying the percentage, the calculated AS-Level grade, and updating the global progress stats.