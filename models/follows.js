module.exports = function(sequelize, DataTypes) {
	return sequelize.define('follows', {
	}, {
		freezeTableName: true,
		tableName: 'follows'
	});
}
