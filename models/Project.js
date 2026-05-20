// models/Project.js
const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    default: 'Untitled Project'
  },
  figma_file_id: {
    type: String,
    default: null
  },
  json_layout_data: {
    type: Object,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema);
