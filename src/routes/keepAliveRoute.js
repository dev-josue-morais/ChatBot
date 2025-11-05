const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('keep_alive')
      .select('status')
      .limit(1);

    if (error) {
      console.error('Erro no keep-alive Supabase:', error);
      return res.status(500).send('Erro no keep-alive');
}

    res.send('1');
  } catch (err) {
    next(err);
  }
});

module.exports = router;