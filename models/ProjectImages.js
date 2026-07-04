// models/ProjectImages.js
// Stores a project's base64 image blob SEPARATELY from json_layout_data.
//
// WHY: the base64 images are ~99% of an export payload (e.g. 5.3MB of images
// vs 24KB of actual layout). Keeping them in the Project document bloats every
// read and pushes big designs toward MongoDB's 16MB per-document limit. Moving
// them here keeps the layout document tiny and fast. On import, api.js
// re-attaches images to json_layout_data so the Roblox plugin sees no change.
const mongoose = require('mongoose');

const ProjectImagesSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    unique: true,
    index: true
  },
  images: {
    type: Object,   // { imageName: base64png }
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('ProjectImages', ProjectImagesSchema);
