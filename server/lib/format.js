// Currency formatter: converts number to USD string
const fmt = n => '$' + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

module.exports = { fmt };
