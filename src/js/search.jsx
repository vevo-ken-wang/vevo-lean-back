/** @jsx React.DOM */
var React = require('react');

var Search = React.createClass({
  render: function(){
    return (
      <div className="search-component ui fluid icon input">
        <input type="text" placeholder="Search Artists..." />
        <i className="search icon"></i>
      </div>
    );
  }
});

module.exports = Search;
