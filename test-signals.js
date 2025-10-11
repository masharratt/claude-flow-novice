
        process.on('SIGINT', () => {
          console.log('SIGINT received');
          process.exit(0);
        });

        setTimeout(() => {
          console.log('Process ready for signals');
        }, 100);
      