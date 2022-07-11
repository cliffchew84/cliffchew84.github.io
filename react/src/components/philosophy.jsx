export const Philosophy = (props) => {
  return (
    <div id='philosophy' className='text-center'>
      <div className='container'>
        <div className='section-title'>
          <h2>Teaching Philosophy</h2>
          <p>
            This is our Teaching Philosophy
          </p>
        </div>
        <div className='row'>
          {props.data
            ? props.data.map((d, i) => (
                <div key={`${d.name}-${i}`} className='col-md-4'>
                  {' '}
                  <i className={d.icon}></i>
                  <div className='philo-desc'>
                    <h3>{d.name}</h3>
                    <p>{d.text}</p>
                  </div>
                </div>
              ))
            : 'loading'}
        </div>
      </div>
    </div>
  )
}
