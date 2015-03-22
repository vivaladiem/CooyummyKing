module.exports = function(sequelize, DataTypes) {
	return sequelize.define('comments', {
		id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			autoIncerment: true
		}
	}, {
		freezeTableName: true,
		tableName: 'comments'
	});
}
