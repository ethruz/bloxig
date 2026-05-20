const mongoose = require('mongoose');
const Project = require('./models/Project'); // Adjust path if needed
require('dotenv').config();

async function injectFakeFigmaData() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bloxig');

    const fakeUI = {
        name: "Test Anime Menu",
        owner: "6644a1b2e4b0f1a2c3d4e5f6", // Use a real User ID from your DB or a placeholder
        json_layout_data: [
            {
                id: "frame_001",
                type: "FRAME",
                name: "MainBackground",
                x: 100, y: 100, width: 400, height: 300,
                backgroundColor: "#1c1c1c",
                cornerRadius: 15,
                children: [
                    {
                        id: "text_001",
                        type: "TEXT",
                        name: "Title",
                        characters: "BLOXIG TEST",
                        x: 20, y: 20, width: 200, height: 50,
                        backgroundColor: "#4f7bf7"
                    }
                ]
            }
        ]
    };

    const project = await Project.create(fakeUI);
    console.log("✅ Fake Figma design injected!");
    console.log("👉 PROJECT ID TO USE IN ROBLOX:", project._id);
    process.exit();
}

injectFakeFigmaData();
