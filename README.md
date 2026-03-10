🌿 EcoTrack - Waste Management System
EcoTrack is a professional waste management system designed to track waste logs, monitor bin capacities, and manage staff targets. It features a modern dashboard, real-time alerts, and comprehensive analytics.

🚀 Features
📊 Real-time Dashboard: Overview of total bins, full bins, waste collected today, and active alerts.
🗑️ Bin Management: Track bin capacity, current fill level, and cleaning status.
📝 Waste Logging: Staff can log waste entries with type and quantity.
⚠️ Smart Alerts: Automatic alerts when bins exceed 80% capacity.
📈 Analytics: Visual representation of waste categories and weekly trends using Chart.js.
🎯 Target Management: Set and track daily waste collection targets for staff.
🔐 Secure Authentication: Role-based access control (Admin/Staff) using bcryptjs and express-session.
🛠️ Technology Stack
Backend: Node.js, Express.js
Database: SQLite3
Frontend: Vanilla HTML5, CSS3, JavaScript
Libraries:
bcryptjs: Password hashing
chart.js: Data visualization
express-session: Session management
pdfkit: PDF report generation (capability included)
json2csv: CSV export (capability included)
📁 Project Structure
waste-management-system/
├── src/                # Backend source code
│   ├── server.js       # Main entry point
│   └── database/       # Database initialization and schema
├── public/             # Frontend assets (HTML, CSS, JS)
├── tests/              # Test scripts
├── logs/               # Project logs and temporary output
├── package.json        # Dependencies and scripts
└── waste_management.db # SQLite database file
🏁 Getting Started
Prerequisites
Node.js (v14 or higher recommended)
npm (Node Package Manager)
Installation
Clone the repository or extract the project files.
Navigate to the project directory:
cd waste-management-system
Install dependencies:
npm install
Running the Project
Start the server:
npm start
Development mode:
npm run dev
The application will be available at http://localhost:3005.

Default Credentials
Admin: admin / admin123
Staff: (Can be created by Admin)
📄 License
This project is for educational/demonstration purposes.
