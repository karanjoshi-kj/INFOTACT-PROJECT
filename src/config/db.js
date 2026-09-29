const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        console.log(process.env.MONGO_URI);
        
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB Connected Successfully");
    } catch (error) {
        console.log("MongoDB Connection Failed");
        console.log(error.message);
    }
};

module.exports = connectDB;