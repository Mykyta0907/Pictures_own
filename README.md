## How to Run in WebStorm

1. Open the project in **WebStorm**.
2. Choose the picture you want to display.
3. Open the corresponding folder in the Project panel.
4. Make sure **Node.js** is installed on your computer.

### Check Node.js

Open the WebStorm terminal (`View → Tool Windows → Terminal`) and execute:

```bash
node -v
```

If Node.js is installed, its version will be displayed.

If it is not installed, download it from [nodejs.org](https://nodejs.org/).

### Run the JavaScript file

1. Navigate to the folder containing your selected picture's JavaScript file.
2. Open the WebStorm terminal.
3. Execute the following command:

```bash
node filename.js
```

Replace `filename.js` with the actual name of the file.

**Example:**

```bash
node cat.js
```

Alternatively, you can right-click the JavaScript file in the Project panel and select **Run 'filename.js'**.

The selected JavaScript file will now execute using Node.js.