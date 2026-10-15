// Handles the actual file -> public URL conversion after multer has
// already saved the file to disk (see middleware/upload.js).
export function uploadMenuImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const url = `/uploads/menu/${req.file.filename}`;
  res.status(201).json({ url });
}
