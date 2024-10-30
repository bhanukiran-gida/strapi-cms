module.exports = {
    routes: [
      {
        method: 'GET',
        path: '/old-articles/:slug',
        handler: 'old-article.findOne',
        config: {
          auth: false
        },
      }
    ]
  }