# AttendWise 

AttendWise is a privacy-first, offline-capable college attendance tracking application. It allows students to map out their semester timetables, track daily class attendance, and visualize their progress towards their target attendance goals natively on Android and the web.

## Features 
- **Dynamic Timetable Grid**: Map out your entire week. Supports merging cells for multi-hour labs!
- **Auto-Schedule Generation**: The built-in engine automatically populates your daily schedule up to 4 months into the future based on your saved timetable.
- **Privacy First (IndexedDB)**: 100% of your data lives securely in your local browser/device storage via Dexie.js. No cloud accounts required.
- **Analytics & Insights**: View interactive Donut and Bar charts tracking your overall and subject-wise attendance percentages.
- **Capacitor Android Build**: Wraps the fast Vite web app into a high-performance native Android application with zero UI compromises.

## Tech Stack 
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Database**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Charts**: [Chart.js](https://www.chartjs.org/)
- **Mobile Framework**: [Capacitor](https://capacitorjs.dev/) (Native Android wrapping)

## Getting Started 

### For Web Development
1. Ensure you have Node.js and npm installed.
2. Clone the repository:
   `ash
   git clone https://github.com/naringrekarneel/ATTENDWISE.git
   `
3. Install dependencies:
   `ash
   npm install
   `
4. Start the development server:
   `ash
   npm run dev
   `

### For Android Build (Capacitor)
1. Ensure you have **Android Studio** installed.
2. Build the web app for production:
   `ash
   npm run build
   `
3. Sync the web assets to the Android project:
   `ash
   npx cap sync android
   `
4. Open the project in Android Studio to run it on an emulator or build the APK:
   `ash
   npx cap open android
   `

## License
MIT License
