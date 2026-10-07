require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");
const startYjsServer = require("./src/sockets/yjsServer");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    startYjsServer(1234);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

startServer();
