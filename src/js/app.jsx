/** @jsx React.DOM */

var api = require('./api.js');
var React = require('react');
var Search = require('./search.jsx');

console.log('~= Smart Lean Back =~');
window.api = api;

React.render(
  <Search/>,
  document.getElementById('content')
);
