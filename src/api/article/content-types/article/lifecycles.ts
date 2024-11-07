import { log } from "console";

const { ApplicationError } = require('@strapi/utils').errors;
module.exports = {
	async beforeCreate(event) {
		const { data } = event.params;

		if (!data.category) {
			throw new ApplicationError('Category is required');
		}
	},
	async beforeUpdate(event) {
		const { data } = event.params;
		if (!data.category) {
			throw new ApplicationError('Category is required');
    }
    const ctx = strapi.requestContext.get();
    console.log(ctx.request.body?.articleContent, 'whagt here');
    const articleContent = ctx.request.body?.articleContent;
    const content = articleContent?.filter((ele) => ele.type === 'article-block' || ele.type ==='article-grid');
    if(content?.length < 1) throw new ApplicationError('Article block content is required')
    const qb = ctx.request.body?.quoteBanner; 
    if (!qb) return;
    delete qb.id;
    const values = Object.values(qb);
    const isUndefined = values.every((item) => item == null)
    if (!isUndefined) {
      for (const key in qb) {
        if (qb[key] == null) {
          throw new ApplicationError(`Quote Banner ${key} is required`)
        }
      }
    }
	},
};
