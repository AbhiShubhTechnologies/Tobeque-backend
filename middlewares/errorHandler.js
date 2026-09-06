const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Application Error:', err);

  // Multer Error Handlers
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: `Upload Error: ${err.message}`
    });
  }

  // MongoDB Duplicate Key Error (Code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'slug';
    const val = err.keyValue ? err.keyValue[field] : '';
    return res.status(400).json({
      success: false,
      error: `A record with ${field} '${val}' already exists. Please choose a different ${field}.`
    });
  }

  // Sequelize Unique Constraint Validation
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      error: `Database Constraint Error: ${err.errors[0].message}`
    });
  }

  // Sequelize General Validation
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      error: err.errors.map(e => e.message).join(', ')
    });
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
};

module.exports = errorHandler;
