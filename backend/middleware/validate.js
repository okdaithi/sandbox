const { body, param, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

const registerValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3–50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username may only contain letters, numbers and underscores'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role')
    .optional()
    .isIn(['facilitator', 'team_member']).withMessage('Role must be facilitator or team_member'),
  handleValidationErrors
];

const createSessionValidation = [
  body('scenario_id').trim().notEmpty().isUUID().withMessage('Valid scenario_id UUID is required'),
  handleValidationErrors
];

const submitDecisionValidation = [
  param('id').trim().notEmpty().isUUID().withMessage('Valid session id UUID is required'),
  body('team_id').trim().notEmpty().isUUID().withMessage('Valid team_id UUID is required'),
  body('decision_data').notEmpty().withMessage('decision_data is required'),
  handleValidationErrors
];

module.exports = {
  loginValidation,
  registerValidation,
  createSessionValidation,
  submitDecisionValidation
};
